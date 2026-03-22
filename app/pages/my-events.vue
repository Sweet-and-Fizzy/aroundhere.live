<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

useSeoMeta({
  title: 'My Events - AroundHere',
  description: 'View and manage your submitted events',
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">
        My Events
      </h1>
      <UButton
        to="/events/submit"
        color="primary"
        icon="i-heroicons-plus"
      >
        Submit Event
      </UButton>
    </div>

    <UCard>
      <MySubmissions />
    </UCard>
  </div>
</template>
