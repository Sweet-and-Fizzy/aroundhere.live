<script setup lang="ts">
// Unsubscribing takes a click, not a page load, because mail scanners follow links.
definePageMeta({ title: 'Unsubscribe' })
useSeoMeta({ robots: 'noindex' })

const route = useRoute()
const status = ref<'idle' | 'working' | 'done' | 'error'>('idle')

async function unsubscribe() {
  status.value = 'working'
  try {
    await $fetch('/api/unsubscribe', {
      method: 'POST',
      query: { token: route.query.token },
    })
    status.value = 'done'
  } catch {
    status.value = 'error'
  }
}
</script>

<template>
  <div class="flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full text-center">
      <h1 class="text-2xl font-bold text-gray-900 mb-4">
        Weekly email
      </h1>

      <template v-if="status === 'done'">
        <p class="text-gray-700 mb-4">
          You're unsubscribed from the weekly email.
        </p>
        <NuxtLink
          to="/settings"
          class="underline text-gray-700"
        >
          Manage your settings
        </NuxtLink>
      </template>

      <template v-else-if="status === 'error'">
        <p class="text-gray-700 mb-4">
          That link didn't work. You can turn the weekly email off in your settings instead.
        </p>
        <NuxtLink
          to="/settings"
          class="underline text-gray-700"
        >
          Go to settings
        </NuxtLink>
      </template>

      <template v-else>
        <p class="text-gray-700 mb-6">
          Stop getting the AroundHere weekly email?
        </p>
        <UButton
          :loading="status === 'working'"
          @click="unsubscribe"
        >
          Unsubscribe
        </UButton>
      </template>
    </div>
  </div>
</template>
