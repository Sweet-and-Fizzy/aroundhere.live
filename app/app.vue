<script setup lang="ts">
const { loggedIn, user } = useUserSession()

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
            <div class="flex gap-6">
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
