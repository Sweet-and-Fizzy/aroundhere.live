<script setup lang="ts">
const config = useRuntimeConfig()
const canonicalUrl = `${config.public.siteUrl}/contact`
const { regionName } = useCurrentRegion()

useSeoMeta({
  title: 'Contact - AroundHere',
  description: 'Get in touch with AroundHere. Share suggestions, report issues, or request changes to your venue listing.',
  // Open Graph
  ogTitle: 'Contact Us - AroundHere',
  ogDescription: 'Get in touch with AroundHere. Share suggestions, report issues, or request changes to your venue listing.',
  ogUrl: canonicalUrl,
  ogType: 'website',
  ogImage: `${config.public.siteUrl}/og-image.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  // Twitter
  twitterCard: 'summary_large_image',
  twitterTitle: 'Contact Us - AroundHere',
  twitterDescription: 'Get in touch with AroundHere. Share suggestions or request changes.',
  twitterImage: `${config.public.siteUrl}/og-image.png`,
})

useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
})
</script>

<template>
  <div class="px-2 sm:px-0">
    <!-- Hero Header -->
    <div
      class="text-white py-6 px-4 sm:py-10 sm:px-6 rounded-lg sm:rounded-xl mb-4 sm:mb-8"
      style="background: radial-gradient(ellipse at center, #374151 0%, #1f2937 60%, #111827 100%);"
    >
      <div class="text-center">
        <h1 class="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
          Get In Touch
        </h1>
        <p class="text-sm sm:text-lg text-white/90">
          We'd love to hear from you
        </p>
      </div>
    </div>

    <div class="max-w-2xl mx-auto">
      <UCard class="mb-6">
        <div class="prose prose-gray max-w-none">
          <p class="text-lg text-gray-700">
            AroundHere is a community project built to help folks discover live music in {{ regionName }}. We're always looking to make it better!
          </p>
        </div>
      </UCard>

      <div class="grid gap-6">
        <!-- Suggestions -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-light-bulb"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Have a suggestion?</span>
            </div>
          </template>
          <p class="text-gray-600">
            Know a venue we're missing? Have an idea to make the site more useful? We're all ears. Drop us a line and help us make AroundHere better for everyone.
          </p>
        </UCard>

        <!-- Venue owners -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-building-storefront"
                class="w-5 h-5 text-primary-500"
              />
              <span class="font-semibold">Venue owners & promoters</span>
            </div>
          </template>
          <p class="text-gray-600 mb-3">
            Want to make sure your events are showing up correctly? Need to update your venue info or add your logo? Let us know and we'll get it sorted.
          </p>
          <p class="text-gray-600">
            We pull event info from public sources, but we totally understand if you'd prefer not to be included. Just reach out and we'll remove your venue or events - no questions asked.
          </p>
        </UCard>

        <!-- Contact -->
        <UCard class="bg-gray-50">
          <div class="text-center py-4">
            <p class="text-gray-600 mb-4">
              The best way to reach us is by email:
            </p>
            <a
              href="mailto:whatsup@aroundhere.live"
              class="inline-flex items-center gap-2 text-xl font-medium text-primary-600 hover:text-primary-700"
            >
              <UIcon
                name="i-heroicons-envelope"
                class="w-6 h-6"
              />
              whatsup@aroundhere.live
            </a>
          </div>
        </UCard>
      </div>

      <!-- Back link -->
      <div class="mt-8 text-center">
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-left"
        >
          Back to Events
        </UButton>
      </div>
    </div>
  </div>
</template>
