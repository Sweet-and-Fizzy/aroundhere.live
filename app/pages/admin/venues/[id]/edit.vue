<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const route = useRoute()
const router = useRouter()
const venueId = route.params.id as string

const { data: venue, error } = await useFetch(`/api/admin/venues/${venueId}`)

const form = ref({
  name: '',
  slug: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  website: '',
  phone: '',
  email: '',
  description: '',
  accessibilityInfo: '',
  venueType: 'OTHER',
  capacity: null as number | null,
  latitude: null as number | null,
  longitude: null as number | null,
  logoUrl: '',
  imageUrl: '',
  isActive: true,
})

// Populate form when venue loads
watchEffect(() => {
  if (venue.value) {
    form.value = {
      name: venue.value.name || '',
      slug: venue.value.slug || '',
      address: venue.value.address || '',
      city: venue.value.city || '',
      state: venue.value.state || '',
      postalCode: venue.value.postalCode || '',
      website: venue.value.website || '',
      phone: venue.value.phone || '',
      email: venue.value.email || '',
      description: venue.value.description || '',
      accessibilityInfo: venue.value.accessibilityInfo || '',
      venueType: venue.value.venueType || 'OTHER',
      capacity: venue.value.capacity,
      latitude: venue.value.latitude,
      longitude: venue.value.longitude,
      logoUrl: venue.value.logoUrl || '',
      imageUrl: venue.value.imageUrl || '',
      isActive: venue.value.isActive ?? true,
    }
  }
})

const saving = ref(false)
const saveError = ref('')

async function save() {
  saving.value = true
  saveError.value = ''

  try {
    await $fetch(`/api/admin/venues/${venueId}`, {
      method: 'PUT',
      body: form.value,
    })
    router.push('/admin/venues')
  } catch (err: any) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function geocode() {
  if (!form.value.address || !form.value.city || !form.value.state) {
    alert('Address, city, and state are required for geocoding')
    return
  }

  try {
    const result = await $fetch('/api/admin/geocode', {
      method: 'POST',
      body: {
        address: form.value.address,
        city: form.value.city,
        state: form.value.state,
        postalCode: form.value.postalCode,
      },
    })
    if (result.lat && result.lng) {
      form.value.latitude = result.lat
      form.value.longitude = result.lng
    } else {
      alert('Could not geocode this address')
    }
  } catch (err: any) {
    alert(`Geocoding failed: ${err.message}`)
  }
}

const venueTypes = [
  'BAR',
  'BREWERY',
  'RESTAURANT',
  'CLUB',
  'THEATER',
  'CONCERT_HALL',
  'OUTDOOR',
  'CAFE',
  'GALLERY',
  'CHURCH',
  'COMMUNITY_CENTER',
  'OTHER',
]

useSeoMeta({
  title: venue.value ? `Edit ${venue.value.name}` : 'Edit Venue',
})
</script>

<template>
  <div class="px-4 py-8 max-w-2xl mx-auto">
    <div class="mb-6">
      <NuxtLink
        to="/admin/venues"
        class="text-primary-600 hover:underline"
      >
        &larr; Back to Venues
      </NuxtLink>
    </div>

    <h1 class="text-3xl font-bold mb-6">
      Edit Venue
    </h1>

    <div
      v-if="error"
      class="bg-red-50 text-red-700 p-4 rounded-lg mb-6"
    >
      Failed to load venue: {{ error.message }}
    </div>

    <form
      v-else
      class="space-y-6"
      @submit.prevent="save"
    >
      <div
        v-if="saveError"
        class="bg-red-50 text-red-700 p-4 rounded-lg"
      >
        {{ saveError }}
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            v-model="form.name"
            type="text"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input
            v-model="form.slug"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            v-model="form.address"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            v-model="form.city"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input
            v-model="form.state"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
          <input
            v-model="form.postalCode"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Venue Type</label>
          <select
            v-model="form.venueType"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
            <option
              v-for="type in venueTypes"
              :key="type"
              :value="type"
            >
              {{ type.replace('_', ' ') }}
            </option>
          </select>
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Website</label>
          <input
            v-model="form.website"
            type="url"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            v-model="form.phone"
            type="tel"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            v-model="form.email"
            type="email"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
          <input
            v-model="form.capacity"
            type="number"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            v-model="form.description"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Accessibility Information</label>
          <p class="text-xs text-gray-500 mb-2">
            Details about wheelchair access, parking, elevators, accessible restrooms, etc.
          </p>
          <textarea
            v-model="form.accessibilityInfo"
            rows="3"
            placeholder="e.g., Wheelchair accessible entrance, accessible restrooms, parking available"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
          <p class="text-xs text-gray-500 mb-2">
            Square image used in venue lists
          </p>
          <input
            v-model="form.logoUrl"
            type="url"
            placeholder="https://..."
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 mb-2"
          >
          <img
            v-if="form.logoUrl"
            :src="form.logoUrl"
            alt="Logo preview"
            class="w-24 h-24 object-contain bg-gray-100 rounded border"
          >
        </div>

        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Banner Image URL</label>
          <p class="text-xs text-gray-500 mb-2">
            Wide hero image for the venue page header
          </p>
          <input
            v-model="form.imageUrl"
            type="url"
            placeholder="https://..."
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 mb-2"
          >
          <img
            v-if="form.imageUrl"
            :src="form.imageUrl"
            alt="Banner preview"
            class="w-full max-w-md h-32 object-cover bg-gray-100 rounded border"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
          <input
            v-model="form.latitude"
            type="number"
            step="any"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
          <input
            v-model="form.longitude"
            type="number"
            step="any"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
        </div>

        <div class="col-span-2">
          <button
            type="button"
            class="text-sm text-primary-600 hover:underline"
            @click="geocode"
          >
            Geocode from address
          </button>
        </div>

        <div class="col-span-2">
          <label class="flex items-center gap-2">
            <input
              v-model="form.isActive"
              type="checkbox"
              class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            >
            <span class="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>
      </div>

      <div class="flex gap-4">
        <button
          type="submit"
          :disabled="saving"
          class="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
        <NuxtLink
          to="/admin/venues"
          class="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
