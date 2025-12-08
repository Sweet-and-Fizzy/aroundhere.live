<script setup lang="ts">
const { user } = useUserSession()
const route = useRoute()

const isAdmin = computed(() => {
  const role = user.value?.role as string
  return role === 'ADMIN' || role === 'MODERATOR'
})

const isFullAdmin = computed(() => user.value?.role === 'ADMIN')

const adminMenuItems = computed(() => {
  const items = [
    [
      { label: 'Venues', icon: 'i-heroicons-building-storefront', to: '/admin/venues' },
      { label: 'Scrapers', icon: 'i-heroicons-code-bracket', to: '/admin/scrapers' },
      { label: 'Spotify', icon: 'i-heroicons-musical-note', to: '/admin/spotify' },
    ],
  ]

  // Only show Users to full admins
  if (isFullAdmin.value) {
    items.push([
      { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
    ])
  }

  return items
})

// Mobile menu state
const mobileMenuOpen = ref(false)

// Close mobile menu on route change
watch(() => route.fullPath, () => {
  mobileMenuOpen.value = false
})
</script>

<template>
  <UApp>
    <div class="min-h-screen flex flex-col bg-gray-50">
      <!-- Navigation -->
      <nav class="bg-gray-900 text-white">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <NuxtLink
              to="/"
              class="font-bold text-xl hover:text-primary-400 transition-colors"
            >
              AroundHere
            </NuxtLink>

            <!-- Desktop Navigation -->
            <div class="hidden md:flex gap-6">
              <NuxtLink
                to="/"
                class="text-gray-300 hover:text-white transition-colors"
                active-class="text-white font-medium"
              >
                Events
              </NuxtLink>
              <NuxtLink
                to="/venues"
                class="text-gray-300 hover:text-white transition-colors"
                active-class="text-white font-medium"
              >
                Venues
              </NuxtLink>
              <NuxtLink
                to="/playlist"
                class="text-gray-300 hover:text-white transition-colors"
                active-class="text-white font-medium"
              >
                Playlist
              </NuxtLink>
              <NuxtLink
                to="/contact"
                class="text-gray-300 hover:text-white transition-colors"
                active-class="text-white font-medium"
              >
                Contact
              </NuxtLink>

              <!-- Admin Dropdown -->
              <UDropdownMenu
                v-if="isAdmin"
                :items="adminMenuItems"
              >
                <button class="flex items-center gap-1 text-gray-300 hover:text-white transition-colors">
                  <UIcon
                    name="i-heroicons-cog-6-tooth"
                    class="w-5 h-5"
                  />
                  <span>Admin</span>
                  <UIcon
                    name="i-heroicons-chevron-down"
                    class="w-4 h-4"
                  />
                </button>
              </UDropdownMenu>
            </div>

            <!-- Mobile Menu Button -->
            <button
              class="md:hidden p-2 -mr-2 text-gray-300 hover:text-white transition-colors"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              <UIcon
                :name="mobileMenuOpen ? 'i-heroicons-x-mark' : 'i-heroicons-bars-3'"
                class="w-6 h-6"
              />
            </button>
          </div>

          <!-- Mobile Menu -->
          <div
            v-if="mobileMenuOpen"
            class="md:hidden pb-4 border-t border-gray-700"
          >
            <div class="flex flex-col gap-1 pt-3">
              <NuxtLink
                to="/"
                class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                active-class="text-white bg-gray-800 font-medium"
              >
                Events
              </NuxtLink>
              <NuxtLink
                to="/venues"
                class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                active-class="text-white bg-gray-800 font-medium"
              >
                Venues
              </NuxtLink>
              <NuxtLink
                to="/playlist"
                class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                active-class="text-white bg-gray-800 font-medium"
              >
                Playlist
              </NuxtLink>
              <NuxtLink
                to="/contact"
                class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                active-class="text-white bg-gray-800 font-medium"
              >
                Contact
              </NuxtLink>

              <!-- Admin Links for Mobile -->
              <template v-if="isAdmin">
                <div class="border-t border-gray-700 mt-2 pt-2">
                  <div class="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide">
                    Admin
                  </div>
                  <NuxtLink
                    to="/admin/venues"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-building-storefront"
                      class="w-4 h-4"
                    />
                    Venues
                  </NuxtLink>
                  <NuxtLink
                    to="/admin/scrapers"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-code-bracket"
                      class="w-4 h-4"
                    />
                    Scrapers
                  </NuxtLink>
                  <NuxtLink
                    to="/admin/spotify"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-musical-note"
                      class="w-4 h-4"
                    />
                    Spotify
                  </NuxtLink>
                  <NuxtLink
                    v-if="isFullAdmin"
                    to="/admin/users"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-users"
                      class="w-4 h-4"
                    />
                    Users
                  </NuxtLink>
                </div>
              </template>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <NuxtRouteAnnouncer />
        <NuxtPage />
      </main>

      <!-- Footer -->
      <footer class="bg-gray-100 border-t border-gray-200">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-gray-500 text-sm space-y-2">
          <p>Event details may change. Always check the venue website before heading out.</p>
          <p>AroundHere - Western Massachusetts</p>
        </div>
      </footer>
    </div>
  </UApp>
</template>

<style>
@import "tailwindcss";
@import "@nuxt/ui";

/* Apply Nunito Sans font */
@theme {
  --font-sans: 'Nunito Sans', ui-sans-serif, system-ui, sans-serif;
}

/* Override Nuxt UI CSS variables for darker text */
:root {
  --ui-text: #111827;
  --ui-text-dimmed: #111827;
  --ui-text-muted: #374151;
  --ui-text-highlighted: #111827;
  --ui-border: #9ca3af;
  --ui-border-accented: #6b7280;
}

/* Form control overrides for better contrast */
input,
textarea,
select,
button[role="combobox"],
[data-radix-collection-item] {
  color: #111827 !important;
}

input::placeholder,
textarea::placeholder {
  color: #111827 !important;
}

/* Force ring/border color on inputs */
.ring-inset {
  --tw-ring-color: #111827 !important;
}

:root {
  --ui-border-inset: #111827;
}
</style>
