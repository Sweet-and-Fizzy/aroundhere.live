<script setup lang="ts">
import { nextTick } from 'vue'

definePageMeta({
  middleware: ['auth'],
})

const toast = useToast()

// Settings state
const settings = ref({
  // Profile
  email: '',
  displayName: '',
  regionId: null as string | null,
  // Notifications
  notifyFavoriteArtists: true,
  enableRecommendations: false,
})

const availableRegions = ref<Array<{ id: string; name: string; slug: string }>>([])
const loading = ref(true)
const saving = ref(false)
const lastSaved = ref<Date | null>(null)
const hasUnsavedChanges = ref(false)

// Email change state
const showEmailChange = ref(false)
const newEmail = ref('')
const emailChangeLoading = ref(false)

const route = useRoute()

// Load settings on mount
onMounted(async () => {
  // Check for email change success
  if (route.query.emailChanged === 'true') {
    toast.add({
      title: 'Email updated',
      description: 'Your email address has been changed successfully',
      color: 'success',
    })
    // Clean up the URL
    navigateTo('/settings', { replace: true })
  }

  try {
    const data = await $fetch('/api/user/preferences')
    settings.value = {
      email: data.email,
      displayName: data.displayName || '',
      regionId: data.regionId,
      notifyFavoriteArtists: data.notifyFavoriteArtists,
      enableRecommendations: data.enableRecommendations,
    }
    availableRegions.value = data.availableRegions
  } catch (e) {
    console.error('Error loading settings:', e)
    toast.add({
      title: 'Error loading settings',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
})

async function saveSettings(showToast = true) {
  saving.value = true
  try {
    await $fetch('/api/user/preferences', {
      method: 'PUT',
      body: {
        displayName: settings.value.displayName,
        regionId: settings.value.regionId,
        notifyFavoriteArtists: settings.value.notifyFavoriteArtists,
        enableRecommendations: settings.value.enableRecommendations,
      },
    })
    lastSaved.value = new Date()
    hasUnsavedChanges.value = false
    if (showToast) {
      toast.add({
        title: 'Settings saved',
        color: 'success',
      })
    }
  } catch {
    toast.add({
      title: 'Error saving settings',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

// Track if initial load is complete
const initialLoadComplete = ref(false)

// Track changes for save indicator
watch(
  () => ({
    displayName: settings.value.displayName,
    regionId: settings.value.regionId,
    notifyFavoriteArtists: settings.value.notifyFavoriteArtists,
    enableRecommendations: settings.value.enableRecommendations,
  }),
  () => {
    if (initialLoadComplete.value) {
      hasUnsavedChanges.value = true
    }
  },
  { deep: true }
)

// Mark initial load complete after a tick
watch(loading, (isLoading) => {
  if (!isLoading) {
    nextTick(() => {
      initialLoadComplete.value = true
    })
  }
})

// Save on blur - called when user leaves an input field
function saveOnBlur() {
  if (hasUnsavedChanges.value && !saving.value) {
    saveSettings(false)
  }
}

async function requestEmailChange() {
  if (!newEmail.value || newEmail.value === settings.value.email) {
    return
  }

  emailChangeLoading.value = true
  try {
    await $fetch('/api/user/change-email', {
      method: 'POST',
      body: { newEmail: newEmail.value },
    })
    toast.add({
      title: 'Verification email sent',
      description: `Check ${newEmail.value} to confirm the change`,
      color: 'success',
    })
    showEmailChange.value = false
    newEmail.value = ''
  } catch (e: unknown) {
    const error = e as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to request email change',
      color: 'error',
    })
  } finally {
    emailChangeLoading.value = false
  }
}

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  navigateTo('/')
}

useSeoMeta({
  title: 'Settings',
  description: 'Manage your account settings',
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">
      Settings
    </h1>

    <div
      v-if="loading"
      class="flex justify-center py-8"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-6 h-6 animate-spin text-gray-400"
      />
    </div>

    <div
      v-else
      class="space-y-6"
    >
      <!-- Profile Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-user-circle"
              class="w-5 h-5 text-primary-500"
            />
            <span class="font-semibold">Profile</span>
          </div>
        </template>

        <div class="space-y-3">
          <!-- Name and Email row -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <div @focusout="saveOnBlur">
                <UInput
                  v-model="settings.displayName"
                  placeholder="Your name"
                  size="sm"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div
                v-if="!showEmailChange"
                class="flex items-center gap-2"
              >
                <UInput
                  :model-value="settings.email"
                  disabled
                  size="sm"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  @click="showEmailChange = true"
                >
                  Change
                </UButton>
              </div>
              <div
                v-else
                class="space-y-2"
              >
                <UInput
                  v-model="newEmail"
                  type="email"
                  placeholder="New email"
                  size="sm"
                />
                <div class="flex gap-2">
                  <UButton
                    color="primary"
                    size="xs"
                    :loading="emailChangeLoading"
                    :disabled="!newEmail || newEmail === settings.email"
                    @click="requestEmailChange"
                  >
                    Verify
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="showEmailChange = false; newEmail = ''"
                  >
                    Cancel
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Region -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Primary region</label>
            <USelect
              v-model="settings.regionId"
              :items="[...availableRegions].sort((a, b) => a.slug === 'other' ? 1 : b.slug === 'other' ? -1 : a.name.localeCompare(b.name)).map(r => ({ label: r.name.charAt(0).toUpperCase() + r.name.slice(1), value: r.id }))"
              placeholder="Select your region"
              size="sm"
              @update:model-value="saveOnBlur"
            />
          </div>
        </div>
      </UCard>

      <!-- Notifications Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-bell"
              class="w-5 h-5 text-primary-500"
            />
            <span class="font-semibold">Email Notifications</span>
          </div>
        </template>

        <div class="space-y-3">
          <!-- Artist alerts -->
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium">Artist alerts</span>
              <p class="text-xs text-gray-500">
                Get notified when your favorite artists announce shows
              </p>
            </div>
            <USwitch
              v-model="settings.notifyFavoriteArtists"
              size="sm"
              @update:model-value="saveSettings(false)"
            />
          </div>

          <!-- Weekly recommendations -->
          <div class="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <span class="text-sm font-medium">Weekly digest</span>
              <p class="text-xs text-gray-500">
                Curated picks plus all upcoming shows, every Wednesday
              </p>
            </div>
            <USwitch
              v-model="settings.enableRecommendations"
              size="sm"
              @update:model-value="saveSettings(false)"
            />
          </div>
        </div>
      </UCard>

      <!-- Save Status & Sign Out -->
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2 text-sm text-gray-500">
          <template v-if="saving">
            <UIcon
              name="i-heroicons-arrow-path"
              class="w-4 h-4 animate-spin"
            />
            <span>Saving...</span>
          </template>
          <template v-else-if="hasUnsavedChanges">
            <UIcon
              name="i-heroicons-pencil"
              class="w-4 h-4"
            />
            <span>Unsaved changes</span>
          </template>
          <template v-else-if="lastSaved">
            <UIcon
              name="i-heroicons-check-circle"
              class="w-4 h-4 text-green-500"
            />
            <span>Saved</span>
          </template>
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          @click="signOut"
        >
          Sign Out
        </UButton>
      </div>
    </div>
  </div>
</template>
