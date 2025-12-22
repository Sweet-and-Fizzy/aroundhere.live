<script setup lang="ts">
useSeoMeta({
  title: 'Privacy Policy',
  description: 'How AroundHere handles your data',
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-8">
      Privacy Policy
    </h1>

    <div class="prose prose-gray max-w-none space-y-8">
      <p class="text-lg text-gray-600">
        We keep this simple. We collect only what we need to make the app work, and we don't sell your information to anyone.
      </p>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 mb-3">What we collect</h2>
        <ul class="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Email address</strong> — to log you in and send notifications you've requested</li>
          <li><strong>Your favorites</strong> — artists, venues, and genres you choose to follow</li>
          <li><strong>Your region</strong> — so we can show you relevant local events</li>
          <li><strong>Interest description</strong> — if you tell us what music you like, we use it to personalize recommendations</li>
          <li><strong>Chat conversations</strong> — when you use the AI assistant, we log conversations to manage costs and improve the service. These logs are not linked to your account.</li>
          <li><strong>IP address</strong> — for rate limiting and to suggest your initial region</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 mb-3">How we use it</h2>
        <ul class="list-disc list-inside space-y-2 text-gray-700">
          <li>Sending you magic link emails to log in</li>
          <li>Notifying you about events matching your favorites (if you opt in)</li>
          <li>Sending weekly personalized recommendations (if you opt in)</li>
          <li>Showing you events in your region</li>
          <li>Improving the app based on how it's used</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 mb-3">What we don't do</h2>
        <ul class="list-disc list-inside space-y-2 text-gray-700">
          <li>We don't sell your data to anyone</li>
          <li>We don't share your information with advertisers</li>
          <li>We don't track you across other websites</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 mb-3">Third-party services</h2>
        <p class="text-gray-700 mb-3">We use a few services to make the app work:</p>
        <ul class="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Google Analytics</strong> — helps us understand how people use the site (via Google Tag Manager)</li>
          <li><strong>Resend</strong> — delivers our emails</li>
          <li><strong>Anthropic (Claude)</strong> — powers the AI chat and recommendations</li>
          <li><strong>ip-api.com</strong> — determines your approximate location from your IP address</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 mb-3">Your choices</h2>
        <ul class="list-disc list-inside space-y-2 text-gray-700">
          <li>You can update your notification preferences anytime in <NuxtLink to="/settings" class="text-primary-600 hover:underline">Settings</NuxtLink></li>
          <li>You can turn off weekly recommendations</li>
          <li>You can remove favorites whenever you want</li>
          <li>If you want your account deleted, <NuxtLink to="/contact" class="text-primary-600 hover:underline">contact us</NuxtLink></li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 mb-3">Questions or suggestions?</h2>
        <p class="text-gray-700">
          We're committed to respecting your privacy and are always open to feedback. If you have questions about how we handle your data or suggestions for how we can do better, <NuxtLink to="/contact" class="text-primary-600 hover:underline">get in touch</NuxtLink>.
        </p>
      </section>

      <p class="text-sm text-gray-500 pt-4 border-t">
        Last updated: December 2025
      </p>
    </div>
  </div>
</template>
