<script setup lang="ts">
import { shallowRef } from 'vue'
import { VueMonacoEditor, VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import type {
  ScraperVersion,
  SourceInfo,
  TestScraperResponse,
  GetVersionsResponse,
  GetVersionCodeResponse,
  CreateVersionResponse,
  ActivateVersionResponse,
  ScraperMode,
} from '~/types/scraper'

definePageMeta({
  layout: 'admin',
  middleware: 'admin',
})

const route = useRoute()
const toast = useToast()
const sourceId = route.params.sourceId as string

// State
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const activating = ref(false)
const generatingWithAI = ref(false)

const source = ref<SourceInfo | null>(null)
const versions = ref<ScraperVersion[]>([])
const activeVersionNumber = ref<number | null>(null)
const scraperMode = ref<ScraperMode>('auto')
const savingMode = ref(false)
const selectedVersionId = ref<string | null>(null)
const code = ref('')
const hasChanges = ref(false)
const testResults = ref<TestScraperResponse | null>(null)
const showNewVersionDialog = ref(false)
const newVersionDescription = ref('')
const aiFeedback = ref('')
const lastAIPrompt = ref<string>('')
const aiSessionId = ref<string | null>(null)
const aiProgress = ref<string>('')

// Diff comparison state
const showDiffModal = ref(false)
const diffOriginalVersionId = ref<string | null>(null)
const diffModifiedVersionId = ref<string | null>(null)
const diffOriginalCode = ref('')
const diffModifiedCode = ref('')

// Monaco Editor refs for cleanup (use shallowRef for performance)
const editorRef = shallowRef<any>(null)
const diffEditorRef = shallowRef<any>(null)
const modelCache = new Map<string, any>()

// Fetch versions
async function fetchVersions() {
  try {
    loading.value = true
    const data = await $fetch<GetVersionsResponse>(`/api/scrapers/${sourceId}/versions`)
    source.value = data.source
    versions.value = data.versions
    activeVersionNumber.value = data.activeVersionNumber
    scraperMode.value = data.source.scraperMode || 'auto'

    // Load active version by default, or first version if no active version
    if (versions.value.length > 0) {
      const activeVersion = versions.value.find(v => v.isActive)
      if (activeVersion) {
        await loadVersion(activeVersion.id)
      } else {
        // No active version, load the first one (most recent)
        await loadVersion(versions.value[0].id)
      }
    }
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to load versions',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

// Load specific version with model caching for memory optimization
async function loadVersion(versionId: string) {
  try {
    const data = await $fetch<GetVersionCodeResponse>(`/api/scrapers/${sourceId}/versions/${versionId}/code`)

    // Update code first
    code.value = data.code
    selectedVersionId.value = versionId
    hasChanges.value = false
    testResults.value = null

    // The :key on the Monaco editor will handle recreation
    // No need to manually manage models - let Vue handle it
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to load version',
      color: 'error',
    })
  }
}

// Handle code changes
function onCodeChange(value: string | undefined) {
  code.value = value || ''
  hasChanges.value = true
}

// Test preview
async function testPreview() {
  try {
    testing.value = true
    // Clear previous results to free memory
    testResults.value = null
    // Force garbage collection opportunity
    await new Promise(resolve => setTimeout(resolve, 0))

    const data = await $fetch<TestScraperResponse>(`/api/scrapers/${sourceId}/test`, {
      method: 'POST',
      body: {
        code: hasChanges.value ? code.value : undefined,
        versionId: !hasChanges.value ? selectedVersionId.value : undefined,
      },
    })

    testResults.value = data
    if (data.success && data.eventCount !== undefined) {
      toast.add({
        title: 'Test Complete',
        description: `Found ${data.eventCount} events in ${(data.executionTime / 1000).toFixed(1)}s`,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: 'Test Failed',
      description: error.data?.message || 'Failed to test scraper',
      color: 'error',
    })
  } finally {
    testing.value = false
  }
}

// Save as new version
async function saveVersion() {
  if (!newVersionDescription.value.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Please enter a description for this version',
      color: 'error',
    })
    return
  }

  try {
    saving.value = true

    await $fetch<CreateVersionResponse>(`/api/scrapers/${sourceId}/versions`, {
      method: 'POST',
      body: {
        code: code.value,
        description: newVersionDescription.value,
        setActive: false,
      },
    })

    toast.add({
      title: 'Version Saved',
      description: 'New version created successfully',
      color: 'success',
    })

    showNewVersionDialog.value = false
    newVersionDescription.value = ''
    hasChanges.value = false

    // Clear model cache to force reload with new version
    modelCache.forEach(model => model.dispose())
    modelCache.clear()

    // Refresh versions
    await fetchVersions()
  } catch (error: any) {
    toast.add({
      title: 'Save Failed',
      description: error.data?.message || 'Failed to save version',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

// Activate version
async function activateVersion(versionId: string) {
  try {
    activating.value = true

    await $fetch<ActivateVersionResponse>(`/api/scrapers/${sourceId}/versions/${versionId}/activate`, {
      method: 'PUT',
    })

    toast.add({
      title: 'Version Activated',
      description: 'This version is now active in production',
      color: 'success',
    })

    await fetchVersions()
  } catch (error: any) {
    toast.add({
      title: 'Activation Failed',
      description: error.data?.message || 'Failed to activate version',
      color: 'error',
    })
  } finally {
    activating.value = false
  }
}

// Improve with AI
async function improveWithAI() {
  if (!aiFeedback.value.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Please describe what you want to improve',
      color: 'error',
    })
    return
  }

  try {
    generatingWithAI.value = true
    aiProgress.value = 'Starting AI generation...'

    // Build context from test results and current code
    const context = {
      code: code.value,
      testResults: testResults.value,
      feedback: aiFeedback.value,
    }

    const response: any = await $fetch(`/api/scrapers/${sourceId}/improve`, {
      method: 'POST',
      body: context,
    })

    aiSessionId.value = response.sessionId
    // Save the prompt before clearing for later use
    lastAIPrompt.value = aiFeedback.value
    aiFeedback.value = ''

    if (response.success && response.sessionId) {
      // Start polling for progress updates
      await pollAIProgress(response.sessionId)
    } else {
      aiProgress.value = '✗ Failed to start AI generation'
      generatingWithAI.value = false
    }
  } catch (error: any) {
    toast.add({
      title: 'AI Generation Failed',
      description: error.data?.message || 'Failed to start AI generation',
      color: 'error',
    })
    generatingWithAI.value = false
    aiProgress.value = ''
    aiSessionId.value = null
  }
}

// Poll AI session progress
async function pollAIProgress(sessionId: string) {
  const maxAttempts = 60 // Poll for up to 2 minutes
  let attempts = 0

  const poll = async () => {
    try {
      const session: any = await $fetch(`/api/agent/sessions/${sessionId}`)

      // Display latest thinking message if available
      if (session.status === 'IN_PROGRESS') {
        const thinking = session.thinking || []
        if (thinking.length > 0) {
          const latest = thinking[thinking.length - 1]
          aiProgress.value = `[${session.currentIteration}/${session.maxIterations}] ${latest.message || 'Processing...'}`
        } else {
          aiProgress.value = `AI is working... (iteration ${session.currentIteration}/${session.maxIterations})`
        }
      }

      if (session.status === 'SUCCESS') {
        aiProgress.value = '✓ Complete! Loading new version...'

        // Refresh versions list
        await fetchVersions()

        // Find and load the newly created version
        const newVersion = versions.value.find(v => v.agentSessionId === sessionId)
        if (newVersion) {
          await loadVersion(newVersion.id)

          // Mark as changed so Save button becomes enabled
          hasChanges.value = true

          // Auto-run test preview
          aiProgress.value = '✓ Complete! Running test preview...'
          await testPreview()

          // If test preview succeeded and we have the AI prompt, pre-fill version description
          if (testResults.value?.success && lastAIPrompt.value) {
            newVersionDescription.value = lastAIPrompt.value
          }
        }

        setTimeout(() => {
          generatingWithAI.value = false
          aiProgress.value = ''
          aiSessionId.value = null
        }, 2000)
        return
      } else if (session.status === 'FAILED') {
        const errorMsg = session.errorMessage || 'Unknown error'
        aiProgress.value = `✗ Failed: ${errorMsg}`

        // Log full error for debugging
        console.error('AI generation failed:', {
          sessionId,
          error: session.errorMessage,
          status: session.status,
          thinking: session.thinking,
        })

        // Don't auto-clear on failure - let user read the error
        generatingWithAI.value = false
        return
      }

      // Continue polling
      if (attempts < maxAttempts && session.status === 'IN_PROGRESS') {
        attempts++
        setTimeout(poll, 2000)
      } else if (attempts >= maxAttempts) {
        aiProgress.value = '⚠ Taking longer than expected...'
        setTimeout(() => {
          generatingWithAI.value = false
          aiProgress.value = ''
          aiSessionId.value = null
        }, 5000)
      }
    } catch (error) {
      console.error('Failed to poll session:', error)
      generatingWithAI.value = false
      aiProgress.value = ''
      aiSessionId.value = null
    }
  }

  poll()
}

// Monaco Editor instance handler
function handleEditorMount(editor: any) {
  editorRef.value = editor
}

// Diff editor instance handler
function handleDiffEditorMount(editor: any) {
  diffEditorRef.value = editor
}

// Close diff modal and cleanup
function closeDiffModal() {
  showDiffModal.value = false
  // Clear refs after a short delay to allow modal animation to complete
  setTimeout(() => {
    diffOriginalCode.value = ''
    diffModifiedCode.value = ''
    diffOriginalVersionId.value = null
    diffModifiedVersionId.value = null
  }, 300)
}

// Open diff comparison between two versions
async function openDiffComparison(originalVersionId: string, modifiedVersionId: string) {
  try {
    // Fetch both version codes
    const [originalResponse, modifiedResponse] = await Promise.all([
      $fetch<GetVersionCodeResponse>(`/api/scrapers/${sourceId}/versions/${originalVersionId}/code`),
      $fetch<GetVersionCodeResponse>(`/api/scrapers/${sourceId}/versions/${modifiedVersionId}/code`),
    ])

    diffOriginalVersionId.value = originalVersionId
    diffModifiedVersionId.value = modifiedVersionId
    diffOriginalCode.value = originalResponse.code
    diffModifiedCode.value = modifiedResponse.code
    showDiffModal.value = true
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to load version codes for comparison',
      color: 'error',
    })
  }
}

// Compare selected version with previous version
function compareWithPrevious(versionIndex: number) {
  if (versionIndex >= versions.value.length - 1) {
    toast.add({
      title: 'No Previous Version',
      description: 'This is the oldest version',
      color: 'warning',
    })
    return
  }

  const currentVersion = versions.value[versionIndex]
  const previousVersion = versions.value[versionIndex + 1]

  openDiffComparison(previousVersion.id, currentVersion.id)
}

// Update scraper mode
async function updateScraperMode(mode: ScraperMode) {
  try {
    savingMode.value = true
    await $fetch(`/api/scrapers/${sourceId}/config`, {
      method: 'PUT',
      body: { scraperMode: mode },
    })
    scraperMode.value = mode
    toast.add({
      title: 'Mode Updated',
      description: `Scraper mode set to "${mode}"`,
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update scraper mode',
      color: 'error',
    })
  } finally {
    savingMode.value = false
  }
}

// Load on mount
onMounted(() => {
  fetchVersions()
})

// Enhanced cleanup on unmount
onBeforeUnmount(() => {
  // Clear test results to free memory
  testResults.value = null

  // Dispose all cached models first
  modelCache.forEach(model => model.dispose())
  modelCache.clear()

  // Dispose editors
  if (editorRef.value) {
    editorRef.value.dispose()
    editorRef.value = null
  }
  if (diffEditorRef.value) {
    diffEditorRef.value.dispose()
    diffEditorRef.value = null
  }

  // Cleanup any orphaned models (safety measure)
  if ((window as any).monaco) {
    const monaco = (window as any).monaco
    monaco.editor.getModels().forEach((model: any) => {
      if (model.uri.scheme === 'scraper') {
        model.dispose()
      }
    })
  }
})

// Computed: map artists to their events
const artistsWithEvents = computed(() => {
  if (!testResults.value?.events) return []

  const artistMap = new Map<string, any[]>()

  testResults.value.events.forEach((event: any) => {
    if (event.artists && Array.isArray(event.artists)) {
      event.artists.forEach((artist: any) => {
        // Handle both string artists and object artists { name, isHeadliner }
        const artistName = typeof artist === 'string' ? artist : artist?.name
        if (artistName && typeof artistName === 'string' && artistName.trim()) {
          const cleanArtistName = artistName.trim()
          if (!artistMap.has(cleanArtistName)) {
            artistMap.set(cleanArtistName, [])
          }
          artistMap.get(cleanArtistName)!.push({
            title: event.title,
            startsAt: event.startsAt,
          })
        }
      })
    }
  })

  // Convert to array and sort by artist name
  return Array.from(artistMap.entries())
    .map(([artist, events]) => ({ artist, events }))
    .sort((a, b) => a.artist.localeCompare(b.artist))
})

// Adapt scraped event to EventCard format
function adaptEventForCard(event: any, index: number) {
  return {
    id: `preview-${index}`,
    title: event.title || 'Untitled Event',
    slug: `preview-${index}`,
    description: event.description,
    imageUrl: event.imageUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    doorsAt: event.doorsAt,
    coverCharge: event.coverCharge,
    ageRestriction: event.ageRestriction || 'ALL_AGES',
    ticketUrl: event.ticketUrl,
    sourceUrl: event.sourceUrl,
    genres: event.genres || [],
    venue: {
      id: sourceId,
      name: source.value?.name || 'Unknown Venue',
      slug: sourceId,
    },
    eventArtists: (event.artists || []).map((artist: string, i: number) => ({
      artist: {
        id: `artist-${i}`,
        name: artist,
        slug: `artist-${i}`,
      },
      order: i,
    })),
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Scraper Management
        </h1>
        <p
          v-if="source"
          class="text-gray-600"
        >
          {{ source.name }}
        </p>
        <a
          v-if="source?.website"
          :href="source.website"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-1"
        >
          {{ source.website }}
          <UIcon
            name="i-heroicons-arrow-top-right-on-square"
            class="w-3 h-3"
          />
        </a>
      </div>
      <div class="flex items-center gap-4">
        <!-- Scraper Mode Selector -->
        <div
          v-if="source?.hasGeneratedCode || source?.hasHardcodedScraper"
          class="flex items-center gap-2"
        >
          <span class="text-sm text-gray-600">Mode:</span>
          <USelectMenu
            :model-value="scraperMode"
            :options="[
              { label: 'Auto', value: 'auto', description: 'Use AI-generated if available' },
              { label: 'Hardcoded', value: 'hardcoded', description: 'Use hardcoded scraper' },
              { label: 'AI Generated', value: 'ai-generated', description: 'Use AI-generated code' },
            ]"
            value-attribute="value"
            option-attribute="label"
            :loading="savingMode"
            size="sm"
            class="w-40"
            @update:model-value="updateScraperMode"
          />
        </div>
        <UButton
          to="/admin/scrapers"
          variant="ghost"
          size="sm"
          icon="i-heroicons-arrow-left"
        >
          Back to Scrapers
        </UButton>
      </div>
    </div>

    <div
      v-if="loading"
      class="text-center py-12"
    >
      <p>Loading...</p>
    </div>

    <div
      v-else
      class="grid grid-cols-4 gap-6"
    >
      <!-- Sidebar: AI Assistant, Save, and Versions -->
      <div class="col-span-1 space-y-4">
        <!-- AI Assistant Card -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-sm">
              AI Assistant
            </h3>
          </template>

          <div class="space-y-4">
            <!-- Progress indicator with spinner and icons -->
            <div
              v-if="aiProgress"
              class="p-3 rounded-lg bg-blue-50 border border-blue-200"
            >
              <div class="flex items-start gap-2">
                <UIcon
                  v-if="generatingWithAI"
                  name="i-heroicons-arrow-path"
                  class="w-4 h-4 text-blue-600 animate-spin flex-shrink-0 mt-0.5"
                />
                <UIcon
                  v-else-if="aiProgress.startsWith('✓')"
                  name="i-heroicons-check-circle"
                  class="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5"
                />
                <UIcon
                  v-else-if="aiProgress.startsWith('✗') || aiProgress.toLowerCase().includes('failed')"
                  name="i-heroicons-x-circle"
                  class="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-blue-800 whitespace-pre-wrap">
                    {{ aiProgress }}
                  </p>
                </div>
              </div>
            </div>

            <UTextarea
              v-model="aiFeedback"
              placeholder="Describe what you want to improve..."
              :rows="4"
              size="md"
              color="neutral"
              autoresize
              :maxrows="12"
              :disabled="generatingWithAI"
              class="w-full"
            />

            <div class="space-y-2">
              <UButton
                color="primary"
                size="sm"
                block
                icon="i-heroicons-sparkles"
                :loading="generatingWithAI"
                :disabled="!aiFeedback.trim() || generatingWithAI"
                @click="improveWithAI"
              >
                {{ generatingWithAI ? 'Generating...' : 'Improve with AI' }}
              </UButton>

              <p class="text-xs text-gray-500">
                AI will use the current code and test results to generate an improved version
              </p>
            </div>
          </div>
        </UCard>

        <!-- Save New Version Card -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-sm">
                Save New Version
              </h3>
              <UBadge
                v-if="hasChanges"
                color="warning"
                size="xs"
              >
                Unsaved
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <UTextarea
              v-model="newVersionDescription"
              placeholder="Describe the changes..."
              :rows="4"
              size="md"
              color="neutral"
              autoresize
              :maxrows="12"
              class="w-full"
            />

            <div class="space-y-2">
              <UButton
                color="primary"
                size="sm"
                block
                :loading="saving"
                :disabled="!newVersionDescription.trim() || !hasChanges"
                @click="saveVersion"
              >
                Save as New Version
              </UButton>
              <p
                v-if="!hasChanges"
                class="text-xs text-gray-500 text-center"
              >
                Make changes to enable saving
              </p>
            </div>
          </div>
        </UCard>

        <!-- Version List -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">
              Versions
            </h3>
          </template>

          <div
            v-if="versions.length === 0"
            class="text-center py-8 text-gray-500"
          >
            <p class="text-sm">
              No versions yet
            </p>
            <p class="text-xs mt-2">
              Generate a scraper or use the AI Assistant to create the first version
            </p>
          </div>

          <div
            v-else
            class="space-y-2"
          >
            <div
              v-for="(version, index) in versions"
              :key="version.id"
              class="p-3 rounded border cursor-pointer transition-colors"
              :class="{
                'border-primary-500 bg-primary-50': selectedVersionId === version.id,
                'border-gray-200 hover:border-gray-300': selectedVersionId !== version.id,
              }"
              @click="loadVersion(version.id)"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">v{{ version.versionNumber }}</span>
                <UBadge
                  v-if="version.isActive"
                  color="success"
                  size="xs"
                >
                  Active
                </UBadge>
              </div>
              <p class="text-xs text-gray-600 mt-1">
                {{ version.description || 'No description' }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ new Date(version.createdAt).toLocaleDateString() }}
              </p>
              <div
                v-if="!version.isActive || index < versions.length - 1"
                class="mt-2 flex gap-2"
              >
                <UButton
                  v-if="!version.isActive"
                  size="xs"
                  variant="soft"
                  :loading="activating"
                  :disabled="activating"
                  @click.stop="activateVersion(version.id)"
                >
                  Activate
                </UButton>
                <UButton
                  v-if="index < versions.length - 1"
                  size="xs"
                  variant="ghost"
                  icon="i-heroicons-arrows-right-left"
                  @click.stop="compareWithPrevious(index)"
                >
                  Compare
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Main: Code Editor -->
      <div class="col-span-3 space-y-4">
        <!-- Empty State -->
        <UCard v-if="versions.length === 0">
          <div class="text-center py-16">
            <h3 class="text-lg font-semibold mb-2">
              No Scraper Versions Yet
            </h3>
            <p class="text-gray-600 mb-6">
              Get started by generating a scraper with AI
            </p>
            <UButton
              color="primary"
              size="lg"
              icon="i-heroicons-sparkles"
              :to="`/admin/agent/generate?url=${encodeURIComponent(source?.website || '')}`"
            >
              Generate Scraper with AI
            </UButton>
          </div>
        </UCard>

        <!-- Editor -->
        <UCard v-else>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">
                Code Editor
              </h3>
              <UBadge
                v-if="hasChanges"
                color="warning"
                size="xs"
              >
                Unsaved changes
              </UBadge>
            </div>
          </template>

          <div
            v-if="selectedVersionId && code"
            class="-m-6"
          >
            <VueMonacoEditor
              :key="selectedVersionId"
              v-model:value="code"
              language="javascript"
              :options="{
                theme: 'vs-dark',
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: false,
                renderValidationDecorations: 'on', // Enable validation decorations
                quickSuggestions: false,
                parameterHints: { enabled: false },
                suggest: { enabled: false },
                codeLens: false,
                folding: true,
                glyphMargin: true, // Enable glyph margin for error icons
              }"
              height="400px"
              @change="onCodeChange"
              @mount="handleEditorMount"
            />
          </div>
          <div
            v-else
            class="text-center py-12 text-gray-500"
          >
            <p>{{ selectedVersionId ? 'Loading code...' : 'Select a version to view its code' }}</p>
          </div>

          <template #footer>
            <div class="flex items-center justify-end gap-2">
              <UButton
                :loading="testing"
                :disabled="!code"
                @click="testPreview"
              >
                Test Preview
              </UButton>
              <UButton
                v-if="testResults"
                variant="ghost"
                size="sm"
                color="neutral"
                @click="testResults = null"
              >
                Clear Results
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Test Results -->
        <UCard v-if="testResults">
          <template #header>
            <h3 class="font-semibold">
              Test Results
            </h3>
          </template>

          <div class="space-y-4">
            <div
              v-if="testResults.success"
              class="space-y-2"
            >
              <div class="flex items-center gap-4 text-sm">
                <span><strong>Events Found:</strong> {{ testResults.eventCount }}</span>
                <span><strong>Execution Time:</strong> {{ (testResults.executionTime / 1000).toFixed(1) }}s</span>
                <span><strong>Completeness:</strong> {{ (testResults.fieldsAnalysis.completenessScore * 100).toFixed(0) }}%</span>
              </div>

              <div>
                <p class="text-sm font-medium mb-2">
                  Field Coverage:
                </p>
                <div class="grid grid-cols-3 gap-2">
                  <div
                    v-for="field in testResults.fieldsAnalysis.coverage"
                    :key="field.field"
                    class="text-xs"
                  >
                    <span :class="field.percentage === 100 ? 'text-green-600' : 'text-orange-600'">
                      {{ field.field }}: {{ field.percentage.toFixed(0) }}%
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="artistsWithEvents.length > 0">
                <p class="text-sm font-medium mb-2">
                  Artists Found ({{ artistsWithEvents.length }}):
                </p>
                <div class="space-y-3">
                  <div
                    v-for="{ artist, events } in artistsWithEvents"
                    :key="artist"
                    class="text-sm"
                  >
                    <div class="font-medium text-gray-900 dark:text-gray-100">
                      {{ artist }}
                    </div>
                    <div class="ml-4 mt-1 space-y-1">
                      <div
                        v-for="(event, idx) in events"
                        :key="idx"
                        class="text-xs text-gray-600 dark:text-gray-400"
                      >
                        → {{ event.title }}
                        <span
                          v-if="event.startsAt"
                          class="text-gray-500 dark:text-gray-500"
                        >
                          ({{ new Date(event.startsAt).toLocaleDateString() }})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="testResults.events.length > 0">
                <p class="text-sm font-medium mb-3">
                  Preview (showing first 3 of {{ testResults.events.length }} events):
                </p>
                <div class="space-y-4">
                  <EventCard
                    v-for="(event, i) in testResults.events.slice(0, 3)"
                    :key="i"
                    :event="adaptEventForCard(event, i)"
                  />
                </div>
              </div>
            </div>

            <div
              v-else
              class="text-red-600"
            >
              <p class="font-medium">
                Test Failed
              </p>
              <p class="text-sm">
                {{ testResults.error }}
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>

  <!-- Diff Comparison Modal -->
  <ClientOnly>
    <div
      v-if="showDiffModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      @click.self="closeDiffModal"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900">
            Compare Versions
          </h3>
          <button
            class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            @click="closeDiffModal"
          >
            <UIcon
              name="i-heroicons-x-mark"
              class="w-5 h-5 text-gray-500"
            />
          </button>
        </div>

        <!-- Body -->
        <div
          v-if="diffOriginalCode && diffModifiedCode"
          class="flex-1 overflow-auto p-6"
        >
          <div class="flex gap-4 text-sm mb-4">
            <div class="flex-1">
              <p class="font-medium text-gray-700">
                Original (v{{ versions.find(v => v.id === diffOriginalVersionId)?.versionNumber }})
              </p>
            </div>
            <div class="flex-1">
              <p class="font-medium text-gray-700">
                Modified (v{{ versions.find(v => v.id === diffModifiedVersionId)?.versionNumber }})
              </p>
            </div>
          </div>

          <VueMonacoDiffEditor
            :original="diffOriginalCode"
            :modified="diffModifiedCode"
            language="javascript"
            :options="{
              theme: 'vs-dark',
              minimap: { enabled: false },
              fontSize: 14,
              renderSideBySide: true,
              readOnly: true,
              automaticLayout: true,
            }"
            height="600px"
            @mount="handleDiffEditorMount"
          />
        </div>
        <div
          v-else
          class="flex-1 flex items-center justify-center text-gray-500"
        >
          <p>Loading comparison...</p>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <UButton
            variant="outline"
            @click="closeDiffModal"
          >
            Close
          </UButton>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>
