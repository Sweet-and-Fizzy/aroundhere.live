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
              Local Music
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
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-gray-500 text-sm">
          Local Music Listings - Western Massachusetts
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
