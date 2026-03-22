<script setup lang="ts">
const props = defineProps<{
  eventId: string
  eventTitle: string
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const submitting = ref(false)
const reason = ref('')
const message = ref('')

const reasons = [
  { value: 'WRONG_DATE', label: 'Wrong date or time' },
  { value: 'WRONG_VENUE', label: 'Wrong venue' },
  { value: 'CANCELLED', label: 'Event is cancelled' },
  { value: 'DUPLICATE', label: 'Duplicate listing' },
  { value: 'SPAM', label: 'Spam or inappropriate' },
  { value: 'OTHER', label: 'Other issue' },
]

async function submit() {
  if (!reason.value) return

  submitting.value = true
  try {
    await $fetch(`/api/events/${props.eventId}/report`, {
      method: 'POST',
      body: {
        reason: reason.value,
        message: message.value || undefined,
      },
    })
    toast.add({
      title: 'Report submitted',
      description: 'Thank you for helping keep listings accurate.',
      color: 'success',
    })
    open.value = false
    reason.value = ''
    message.value = ''
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to submit report',
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg">
              Report an issue
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="open = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            Report a problem with "{{ eventTitle }}"
          </p>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <USelect
              v-model="reason"
              :items="reasons.map(r => ({ label: r.label, value: r.value }))"
              placeholder="Select a reason"
              size="sm"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Details (optional)</label>
            <UTextarea
              v-model="message"
              placeholder="Any additional details..."
              :rows="3"
              size="sm"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="open = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="submitting"
              :disabled="!reason"
              @click="submit"
            >
              Submit Report
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
