<script setup lang="ts">
useSeoMeta({
  title: 'How It Works',
  description: 'Learn how to get the most out of AroundHere - follow artists, get notified about shows, and discover new music.',
})

const { loggedIn, ready } = useUserSession()
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center mb-12">
      <div class="w-32 h-32 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
        <AnimatedLogo
          :playing="true"
          dark
          height="56"
        />
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-4">
        How It Works
      </h1>
      <p class="text-lg text-gray-600">
        AroundHere pulls live music listings from local venues so you can find what's happening nearby. Sign in to get more out of it.
      </p>
    </div>

    <div class="space-y-10">
      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <UIcon name="i-heroicons-heart" class="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Follow What You Love</h2>
            <p class="text-gray-600">
              Favorite artists, venues, and genres with one click from any event page. Build a profile of what you're into.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <UIcon name="i-heroicons-bell" class="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Get Notified</h2>
            <p class="text-gray-600">
              Get daily or weekly emails when your favorite artists or venues have upcoming shows. Enabled by default when you sign up.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Discover New Music</h2>
            <p class="text-gray-600">
              Opt in to weekly recommendations curated for your taste. Tell us what you're into and we'll surface shows you might have missed.
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
        <UIcon name="i-heroicons-arrow-right" class="w-4 h-4" />
      </NuxtLink>
      <NuxtLink
        v-else
        to="/interests"
        class="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
      >
        View Your Interests
        <UIcon name="i-heroicons-arrow-right" class="w-4 h-4" />
      </NuxtLink>
    </div>
  </div>
</template>
