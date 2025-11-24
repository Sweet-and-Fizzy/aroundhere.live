<template>
  <UApp>
    <div class="min-h-screen flex flex-col bg-gray-50">
      <!-- Navigation -->
      <nav class="bg-gray-900 text-white">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <NuxtLink to="/" class="font-bold text-xl hover:text-primary-400 transition-colors">
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
</style>
