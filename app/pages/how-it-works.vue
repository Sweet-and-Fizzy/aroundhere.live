<script setup lang="ts">
useSeoMeta({
  title: 'How It Works',
  description: 'Learn how to get the most out of AroundHere - discover local events, get personalized recommendations, and never miss a show.',
})

const { loggedIn, ready } = useUserSession()
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center mb-12">
      <div class="w-32 h-32 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
        <AnimatedLogo
          :playing="true"
          height="56"
        />
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-4">
        How It Works
      </h1>
      <p class="text-lg text-gray-600">
        AroundHere aggregates event listings from local venues so you can discover what's happening nearby — live music, comedy, open mics, theater, and more.
      </p>
    </div>

    <div class="space-y-10">
      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <UIcon
              name="i-heroicons-magnifying-glass"
              class="w-5 h-5 text-blue-600"
            />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              Browse & Filter Events
            </h2>
            <p class="text-gray-600">
              Search by keyword, filter by date range, genre, venue, or event type. Switch to map view to explore what's happening near you. Every event links to ticket pages, venue details, and artist profiles.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <UIcon
              name="i-heroicons-chat-bubble-left-right"
              class="w-5 h-5 text-amber-600"
            />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              Ask Questions
            </h2>
            <p class="text-gray-600">
              Use the chat to ask in plain English — "What's happening this weekend?", "Find me some jazz", or "Recommend something for me". It knows about all upcoming events and can filter based on your preferences.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <UIcon
              name="i-heroicons-heart"
              class="w-5 h-5 text-red-500"
            />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              Save Favorites & Get Notified
            </h2>
            <p class="text-gray-600">
              Tap the heart on any event to save artists and venues you like. We'll email you when they have upcoming shows — enabled by default, adjustable anytime in settings. You can also describe your taste on your
              <NuxtLink
                to="/interests"
                class="text-primary-600 hover:text-primary-700 font-medium underline"
              >
                interests page
              </NuxtLink>
              to power personalized recommendations.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <UIcon
              name="i-heroicons-user"
              class="w-5 h-5 text-purple-500"
            />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              Artist & Venue Profiles
            </h2>
            <p class="text-gray-600">
              Tap any artist or venue to see their full profile. Artist pages include bios, genres, social links, and an embedded Spotify player. Venue pages show location, contact info, and all upcoming events at that spot.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <SpotifyIcon class="w-5 h-5 text-[#1DB954]" />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              Preview Artists on Spotify
            </h2>
            <p class="text-gray-600">
              Our
              <NuxtLink
                to="/playlist"
                class="text-primary-600 hover:text-primary-700 font-medium underline"
              >
                Spotify playlist
              </NuxtLink>
              features artists with upcoming local shows. It updates daily — artists playing sooner appear first, and tracks are removed after their show passes.
            </p>
          </div>
        </div>
      </section>
    </div>

    <div class="mt-12 text-center">
      <!-- Loading state -->
      <div
        v-if="!ready"
        class="inline-block h-12 w-40 bg-gray-200 rounded-lg animate-pulse"
      />
      <NuxtLink
        v-else-if="!loggedIn"
        to="/login"
        class="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
      >
        Get Started
        <UIcon
          name="i-heroicons-arrow-right"
          class="w-4 h-4"
        />
      </NuxtLink>
      <NuxtLink
        v-else
        to="/interests"
        class="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
      >
        View Your Interests
        <UIcon
          name="i-heroicons-arrow-right"
          class="w-4 h-4"
        />
      </NuxtLink>
    </div>
  </div>
</template>
