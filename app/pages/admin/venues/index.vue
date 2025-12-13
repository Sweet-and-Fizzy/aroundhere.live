<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const { data: response, refresh } = await useFetch('/api/admin/venues')
const { data: hardcodedData } = await useFetch('/api/agent/hardcoded-scrapers')

const venues = computed(() => response.value?.venues || [])
const hardcodedScraperSlugs = computed(() => new Set(hardcodedData.value?.slugs || []))

function formatDate(date: string | null) {
  if (!date) return 'Never'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getScraperStatusClass(venue: any) {
  if (!venue.scraper) return 'bg-gray-100 text-gray-600'
  if (!venue.scraper.isActive) return 'bg-gray-100 text-gray-600'
  if (venue.scraper.consecutiveFailures > 0) return 'bg-red-100 text-red-700'
  if (venue.scraper.lastRunStatus === 'success') return 'bg-green-100 text-green-700'
  return 'bg-yellow-100 text-yellow-700'
}

function getScraperStatusText(venue: any) {
  if (!venue.scraper) return '+ Scraper'
  if (!venue.scraper.isActive) return 'Disabled'
  if (venue.scraper.consecutiveFailures > 0) {
    return `Failed (${venue.scraper.consecutiveFailures}x)`
  }
  if (venue.scraper.lastRunAt) {
    return venue.scraper.lastRunStatus === 'success' ? 'OK' : venue.scraper.lastRunStatus || 'Unknown'
  }
  return 'Not run yet'
}

async function deleteVenue(id: string, name: string) {
  if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
    return
  }

  try {
    await $fetch(`/api/admin/venues/${id}`, { method: 'DELETE' })
    refresh()
  } catch (error: any) {
    alert(`Failed to delete: ${error.message}`)
  }
}

// Track which scrapers are currently running
const runningScrapers = ref<Set<string>>(new Set())

async function runScraper(sourceId: string, venueName: string) {
  if (runningScrapers.value.has(sourceId)) return

  runningScrapers.value.add(sourceId)

  try {
    const result = await $fetch('/api/agent/run-scraper', {
      method: 'POST',
      body: { sourceId },
      timeout: 200000,
    }) as any

    if (result.success) {
      const filteredMsg = result.filteredCount ? `, Filtered: ${result.filteredCount}` : ''
      const updatedMsg = result.updatedCount ? `, Updated: ${result.updatedCount}` : ''
      alert(`Scraped ${result.eventCount} events for ${venueName}.\nSaved: ${result.savedCount}, Skipped: ${result.skippedCount}${updatedMsg}${filteredMsg}`)
    } else {
      alert(`Scraper failed: ${result.error}`)
    }
    refresh()
  } catch (error: any) {
    alert(`Failed to run scraper: ${error.message}`)
  } finally {
    runningScrapers.value.delete(sourceId)
  }
}

async function runHardcodedScraper(venueSlug: string, venueName: string) {
  const key = `hardcoded-${venueSlug}`
  if (runningScrapers.value.has(key)) return

  runningScrapers.value.add(key)

  try {
    const result = await $fetch('/api/agent/run-hardcoded-scraper', {
      method: 'POST',
      body: { venueSlug },
      timeout: 200000,
    }) as any

    if (result.success) {
      const filteredMsg = result.filteredCount ? `, Filtered: ${result.filteredCount}` : ''
      const updatedMsg = result.updatedCount ? `, Updated: ${result.updatedCount}` : ''
      alert(`Scraped ${result.eventCount} events for ${venueName}.\nSaved: ${result.savedCount}, Skipped: ${result.skippedCount}${updatedMsg}${filteredMsg}`)
    } else {
      alert(`Scraper failed: ${result.error}`)
    }
    refresh()
  } catch (error: any) {
    alert(`Failed to run scraper: ${error.message}`)
  } finally {
    runningScrapers.value.delete(key)
  }
}

function isScraperRunning(venue: any): boolean {
  if (venue.scraper?.id && runningScrapers.value.has(venue.scraper.id)) return true
  if (hardcodedScraperSlugs.value.has(venue.slug) && runningScrapers.value.has(`hardcoded-${venue.slug}`)) return true
  return false
}

useSeoMeta({
  title: 'Admin - Venues',
  description: 'Manage venues',
})
</script>

<template>
  <div class="px-4 py-8 max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Venues
      </h1>
      <NuxtLink
        to="/admin/scrapers"
        class="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
      >
        Add Venue
      </NuxtLink>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Location
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Scraper
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="venue in venues"
            :key="venue.id"
            class="hover:bg-gray-50"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="font-medium text-gray-900">
                {{ venue.name }}
              </div>
              <div
                v-if="venue.website"
                class="text-sm text-gray-500 max-w-48 truncate"
              >
                <a
                  :href="venue.website"
                  target="_blank"
                  class="hover:underline"
                  :title="venue.website"
                >{{ venue.website.replace(/^https?:\/\//, '') }}</a>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              <div>{{ venue.city }}, {{ venue.state }}</div>
              <div
                v-if="venue.latitude && venue.longitude"
                class="text-xs text-green-600"
              >
                Geocoded
              </div>
              <div
                v-else
                class="text-xs text-yellow-600"
              >
                Not geocoded
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                class="px-2 py-1 text-xs font-medium rounded"
                :class="venue.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
              >
                {{ venue.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <NuxtLink
                :to="`/admin/scrapers?venueId=${venue.id}`"
                class="inline-block"
              >
                <span
                  class="px-2 py-1 text-xs font-medium rounded hover:opacity-80 cursor-pointer"
                  :class="getScraperStatusClass(venue)"
                >
                  {{ getScraperStatusText(venue) }}
                </span>
              </NuxtLink>
              <div
                v-if="venue.scraper?.lastRunAt"
                class="text-xs text-gray-500 mt-1"
              >
                {{ formatDate(venue.scraper.lastRunAt) }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <div class="flex justify-end gap-2">
                <!-- Run Scraper button (AI-generated scraper) -->
                <button
                  v-if="venue.scraper?.id"
                  :disabled="isScraperRunning(venue)"
                  class="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded disabled:opacity-50 disabled:cursor-wait"
                  :title="isScraperRunning(venue) ? 'Running...' : 'Run scraper'"
                  @click="runScraper(venue.scraper.id, venue.name)"
                >
                  <UIcon
                    :name="isScraperRunning(venue) ? 'i-heroicons-arrow-path' : 'i-heroicons-play'"
                    :class="['w-5 h-5', isScraperRunning(venue) ? 'animate-spin' : '']"
                  />
                </button>
                <!-- Run Scraper button (hardcoded scraper) -->
                <button
                  v-else-if="hardcodedScraperSlugs.has(venue.slug)"
                  :disabled="isScraperRunning(venue)"
                  class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-wait"
                  :title="isScraperRunning(venue) ? 'Running...' : 'Run hardcoded scraper'"
                  @click="runHardcodedScraper(venue.slug, venue.name)"
                >
                  <UIcon
                    :name="isScraperRunning(venue) ? 'i-heroicons-arrow-path' : 'i-heroicons-play'"
                    :class="['w-5 h-5', isScraperRunning(venue) ? 'animate-spin' : '']"
                  />
                </button>
                <NuxtLink
                  :to="`/venues/${venue.slug}`"
                  class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="View venue"
                >
                  <UIcon
                    name="i-heroicons-eye"
                    class="w-5 h-5"
                  />
                </NuxtLink>
                <NuxtLink
                  :to="`/admin/venues/${venue.id}/edit`"
                  class="p-1.5 text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded"
                  title="Edit venue"
                >
                  <UIcon
                    name="i-heroicons-pencil-square"
                    class="w-5 h-5"
                  />
                </NuxtLink>
                <button
                  class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                  title="Delete venue"
                  @click="deleteVenue(venue.id, venue.name)"
                >
                  <UIcon
                    name="i-heroicons-trash"
                    class="w-5 h-5"
                  />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="venues.length === 0">
            <td
              colspan="5"
              class="px-6 py-8 text-center text-gray-500"
            >
              No venues found.
              <NuxtLink
                to="/admin/scrapers"
                class="text-primary-600 hover:underline"
              >
                Add one
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</template>
