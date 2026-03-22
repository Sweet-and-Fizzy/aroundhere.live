<script setup lang="ts">
const props = defineProps<{
  venueId: string
  venueName: string
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const submitting = ref(false)
const role = ref('owner')
const contactInfo = ref('')

const roleOptions = [
  { label: 'Owner', value: 'owner' },
  { label: 'Manager', value: 'manager' },
  { label: 'Booker', value: 'booker' },
]

async function handleSubmit() {
  submitting.value = true
  try {
    await $fetch(`/api/venues/${props.venueId}/claim`, {
      method: 'POST',
      body: {
        role: role.value,
        contactInfo: contactInfo.value || undefined,
      },
    })
    toast.add({
      title: 'Claim submitted',
      description: 'Your claim is pending verification by an admin.',
      color: 'success',
    })
    open.value = false
    role.value = 'owner'
    contactInfo.value = ''
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to submit claim',
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
          <span class="font-semibold">Claim {{ venueName }}</span>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="handleSubmit"
        >
          <p class="text-sm text-gray-600">
            Are you affiliated with this venue? Submit a claim and we'll verify your connection.
          </p>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Your Role</label>
            <USelect
              v-model="role"
              :items="roleOptions.map(o => ({ label: o.label, value: o.value }))"
              size="sm"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Additional Info (optional)</label>
            <UTextarea
              v-model="contactInfo"
              placeholder="Tell us about your connection to this venue..."
              :rows="3"
              size="sm"
            />
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              @click="open = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              size="sm"
              :loading="submitting"
            >
              Submit Claim
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </UModal>
</template>
