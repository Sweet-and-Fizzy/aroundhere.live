<script setup lang="ts">
const emit = defineEmits<{
  locate: [coords: { lat: number; lng: number; name?: string }]
  error: [message: string]
}>()

const isLocating = ref(false)

async function locateUser() {
  if (isLocating.value) return

  isLocating.value = true

  try {
    if ('geolocation' in navigator) {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes cache
        })
      })

      emit('locate', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        name: 'Your Location',
      })
    } else {
      // Fallback to IP geolocation
      await fallbackToIpGeolocation()
    }
  } catch {
    // Fallback to IP geolocation if browser geolocation fails
    await fallbackToIpGeolocation()
  } finally {
    isLocating.value = false
  }
}

async function fallbackToIpGeolocation() {
  try {
    const response = await $fetch<{ lat: number; lng: number; city?: string } | null>(
      '/api/regions/geolocate'
    )
    if (response) {
      emit('locate', {
        lat: response.lat,
        lng: response.lng,
        name: response.city || 'Your approximate location',
      })
    } else {
      emit('error', 'Could not determine your location')
    }
  } catch {
    emit('error', 'Could not determine your location')
  }
}
</script>

<template>
  <button
    type="button"
    class="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
    :class="{ 'opacity-50 cursor-wait': isLocating }"
    :disabled="isLocating"
    title="Use my location"
    @click="locateUser"
  >
    <UIcon
      :name="isLocating ? 'i-heroicons-arrow-path' : 'i-heroicons-map-pin'"
      class="w-5 h-5 text-gray-600"
      :class="{ 'animate-spin': isLocating }"
    />
  </button>
</template>
