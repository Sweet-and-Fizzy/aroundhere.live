<script setup lang="ts">
const { user, ready: sessionReady, clear: clearSession } = useUserSession()
const route = useRoute()
const router = useRouter()
const { regionName, loaded: regionLoaded, updateRegion } = useCurrentRegion()

// Initialize region on app mount
onMounted(() => {
  if (import.meta.client) {
    const MAP_BOUNDS_KEY = 'mapBounds'
    try {
      const savedBounds = localStorage.getItem(MAP_BOUNDS_KEY)
      if (savedBounds) {
        const bounds = JSON.parse(savedBounds)
        // Calculate center from bounds (format: { north, south, east, west })
        const centerLat = (bounds.north + bounds.south) / 2
        const centerLng = (bounds.east + bounds.west) / 2
        updateRegion(centerLat, centerLng, true)
      } else {
        // Use default center (Northampton area)
        updateRegion(42.32, -72.63, true)
      }
    } catch {
      // Fallback to default center
      updateRegion(42.32, -72.63, true)
    }
  }
})

const isAdmin = computed(() => {
  const role = user.value?.role as string
  return role === 'ADMIN' || role === 'MODERATOR'
})

const isFullAdmin = computed(() => user.value?.role === 'ADMIN')

// Mobile menu state
const mobileMenuOpen = ref(false)

// Close mobile menu on route change
watch(() => route.fullPath, () => {
  mobileMenuOpen.value = false
})

// Logout handler
async function handleLogout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clearSession()
  mobileMenuOpen.value = false
  router.push('/')
}

const userMenuItems = computed(() => {
  const items: any[][] = [
    [
      { label: user.value?.email, disabled: true },
    ],
    [
      { label: 'My Interests', icon: 'i-heroicons-heart', to: '/interests' },
      { label: 'How It Works', icon: 'i-heroicons-question-mark-circle', to: '/how-it-works' },
      { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: '/settings' },
    ],
  ]

  // Add admin links if user is admin/moderator
  if (isAdmin.value) {
    const adminItems = [
      { label: 'Artists', icon: 'i-heroicons-user-group', to: '/admin/artists' },
      { label: 'Venues', icon: 'i-heroicons-building-storefront', to: '/admin/venues' },
      { label: 'Scrapers', icon: 'i-heroicons-code-bracket', to: '/admin/scrapers' },
      { label: 'Spotify', icon: 'i-heroicons-musical-note', to: '/admin/spotify' },
      { label: 'Cancelled Events', icon: 'i-heroicons-x-circle', to: '/admin/events/cancelled' },
    ]
    if (isFullAdmin.value) {
      adminItems.push({ label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' })
    }
    items.push(adminItems)
  }

  items.push([
    { label: 'Logout', icon: 'i-heroicons-arrow-right-on-rectangle', onSelect: handleLogout },
  ])

  return items
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
              class="hover:opacity-80 transition-opacity"
            >
              <img
                src="/around-here-logo.svg"
                alt="AroundHere.Live"
                class="h-6"
              >
            </NuxtLink>

            <!-- Desktop Navigation -->
            <div class="hidden md:flex items-center gap-6">
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

              <!-- Loading state while session loads -->
              <div
                v-if="!sessionReady"
                class="w-20 h-8 bg-gray-700 rounded-lg animate-pulse"
              />

              <!-- User Menu (logged in) -->
              <UDropdownMenu
                v-else-if="user"
                :items="userMenuItems"
              >
                <button class="flex items-center gap-1 text-gray-300 hover:text-white transition-colors">
                  <UIcon
                    name="i-heroicons-user-circle"
                    class="w-5 h-5"
                  />
                  <UIcon
                    name="i-heroicons-chevron-down"
                    class="w-4 h-4"
                  />
                </button>
              </UDropdownMenu>

              <!-- Sign In Button (logged out) -->
              <NuxtLink
                v-else
                to="/login"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <UIcon
                  name="i-heroicons-user-circle"
                  class="w-4 h-4"
                />
                Sign In
              </NuxtLink>
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

              <!-- User section for Mobile -->
              <div class="border-t border-gray-700 mt-2 pt-2">
                <!-- Loading state -->
                <div
                  v-if="!sessionReady"
                  class="px-3 py-2"
                >
                  <div class="h-8 w-32 bg-gray-700 rounded animate-pulse" />
                </div>

                <template v-else-if="user">
                  <div class="px-3 py-2 text-sm text-gray-400 truncate">
                    {{ user.email }}
                  </div>

                  <NuxtLink
                    to="/interests"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-heart"
                      class="w-4 h-4"
                    />
                    My Interests
                  </NuxtLink>
                  <NuxtLink
                    to="/how-it-works"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-question-mark-circle"
                      class="w-4 h-4"
                    />
                    How It Works
                  </NuxtLink>
                  <NuxtLink
                    to="/settings"
                    class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                    active-class="text-white bg-gray-800 font-medium"
                  >
                    <UIcon
                      name="i-heroicons-cog-6-tooth"
                      class="w-4 h-4"
                    />
                    Settings
                  </NuxtLink>

                  <!-- Admin links for mobile -->
                  <template v-if="isAdmin">
                    <NuxtLink
                      to="/admin/artists"
                      class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                      active-class="text-white bg-gray-800 font-medium"
                    >
                      <UIcon
                        name="i-heroicons-user-group"
                        class="w-4 h-4"
                      />
                      Artists
                    </NuxtLink>
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
                      to="/admin/events/cancelled"
                      class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                      active-class="text-white bg-gray-800 font-medium"
                    >
                      <UIcon
                        name="i-heroicons-x-circle"
                        class="w-4 h-4"
                      />
                      Cancelled Events
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
                  </template>

                  <button
                    class="w-full px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2 text-left"
                    @click="handleLogout"
                  >
                    <UIcon
                      name="i-heroicons-arrow-right-on-rectangle"
                      class="w-4 h-4"
                    />
                    Logout
                  </button>
                </template>

                <!-- Sign In for Mobile (logged out) -->
                <NuxtLink
                  v-else
                  to="/login"
                  class="px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <UIcon
                    name="i-heroicons-user-circle"
                    class="w-4 h-4"
                  />
                  Sign In
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="flex-1 max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <NuxtRouteAnnouncer />
        <NuxtPage />
      </main>

      <!-- Footer -->
      <footer class="bg-gray-100 border-t border-gray-200">
        <div class="max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-gray-500 text-sm space-y-2">
          <p>Event details may change. Always check the venue website before heading out.</p>
          <p>
            AroundHere<Transition name="fade">
              <span v-if="regionLoaded"> - {{ regionName }}</span>
            </Transition>
            <span class="mx-2">·</span>
            <NuxtLink to="/how-it-works" class="hover:text-gray-700">How It Works</NuxtLink>
            <span class="mx-2">·</span>
            <NuxtLink to="/privacy" class="hover:text-gray-700">Privacy</NuxtLink>
          </p>
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

/* Fade transition for region name */
.fade-enter-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from {
  opacity: 0;
}
</style>
