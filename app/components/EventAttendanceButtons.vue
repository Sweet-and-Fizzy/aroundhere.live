<script setup lang="ts">
const props = defineProps<{
  eventId: string
  size?: 'sm' | 'md' | 'lg'
  showCounts?: boolean
  showLabels?: boolean
  progressive?: boolean // Facebook-style: show only Interested first, then Going after
  interestedCount?: number
  goingCount?: number
}>()

const emit = defineEmits<{
  (e: 'update', counts: { interestedCount: number; goingCount: number }): void
}>()

const { loggedIn } = useUserSession()
const { isInterested, isGoing, toggleAttendance } = useEventAttendance()
const toast = useToast()
const route = useRoute()

function promptLogin() {
  toast.add({
    title: 'Sign in to track events',
    description: 'Create an account to mark events and get personalized recommendations.',
    icon: 'i-heroicons-user-circle',
    color: 'info',
    timeout: 8000,
    actions: [{
      label: 'Sign in',
      color: 'primary',
      onClick: () => {
        navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
      },
    }],
  })
}

const toggling = ref(false)

// Local counts that can be updated optimistically
const localInterestedCount = ref(props.interestedCount ?? 0)
const localGoingCount = ref(props.goingCount ?? 0)

// Watch for prop changes
watch(() => props.interestedCount, (val) => {
  if (val !== undefined) localInterestedCount.value = val
})
watch(() => props.goingCount, (val) => {
  if (val !== undefined) localGoingCount.value = val
})

const interested = computed(() => isInterested(props.eventId))
const going = computed(() => isGoing(props.eventId))

// In progressive mode, show Going button only if user has expressed interest or is going
const showGoingButton = computed(() => {
  if (!props.progressive) return true
  return interested.value || going.value
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return { icon: 'w-4 h-4', button: 'p-1', text: 'text-xs' }
    case 'lg':
      return { icon: 'w-6 h-6', button: 'p-2', text: 'text-sm' }
    default:
      return { icon: 'w-5 h-5', button: 'p-1.5', text: 'text-xs' }
  }
})

async function handleInterested() {
  if (toggling.value) return
  if (!loggedIn.value) {
    promptLogin()
    return
  }

  toggling.value = true
  const wasInterested = interested.value

  // Optimistic count update
  if (wasInterested) {
    localInterestedCount.value = Math.max(0, localInterestedCount.value - 1)
  } else {
    localInterestedCount.value++
    // If was going, decrement going count
    if (going.value) {
      localGoingCount.value = Math.max(0, localGoingCount.value - 1)
    }
  }

  try {
    const result = await toggleAttendance(props.eventId, 'INTERESTED')
    if (result) {
      localInterestedCount.value = result.interestedCount
      localGoingCount.value = result.goingCount
      emit('update', result)
    }
  } finally {
    toggling.value = false
  }
}

async function handleGoing() {
  if (toggling.value) return
  if (!loggedIn.value) {
    promptLogin()
    return
  }

  toggling.value = true
  const wasGoing = going.value

  // Optimistic count update
  if (wasGoing) {
    localGoingCount.value = Math.max(0, localGoingCount.value - 1)
  } else {
    localGoingCount.value++
    // If was interested, decrement interested count
    if (interested.value) {
      localInterestedCount.value = Math.max(0, localInterestedCount.value - 1)
    }
  }

  try {
    const result = await toggleAttendance(props.eventId, 'GOING')
    if (result) {
      localInterestedCount.value = result.interestedCount
      localGoingCount.value = result.goingCount
      emit('update', result)
    }
  } finally {
    toggling.value = false
  }
}

const interestedTooltip = computed(() => {
  if (!loggedIn.value) return 'Sign in to mark events'
  return interested.value ? 'Remove interested' : 'Mark as interested'
})

const goingTooltip = computed(() => {
  if (!loggedIn.value) return 'Sign in to mark events'
  return going.value ? 'Remove going' : 'Mark as going'
})
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Interested button -->
    <UTooltip
      v-if="!showLabels"
      :text="interestedTooltip"
    >
      <button
        type="button"
        :class="[
          'rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 flex items-center justify-center',
          sizeClasses.button,
          interested
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-gray-400 hover:text-amber-400',
          !loggedIn && 'opacity-75',
        ]"
        :disabled="toggling"
        @click.prevent.stop="handleInterested"
      >
        <UIcon
          :name="interested ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
          :class="[sizeClasses.icon, toggling && 'animate-pulse']"
        />
      </button>
    </UTooltip>
    <button
      v-else
      type="button"
      :class="[
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500',
        interested
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        !loggedIn && 'opacity-75',
      ]"
      :disabled="toggling"
      @click.prevent.stop="handleInterested"
    >
      <UIcon
        :name="interested ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
        :class="['w-4 h-4', toggling && 'animate-pulse']"
      />
      Interested
    </button>
    <span
      v-if="showCounts && localInterestedCount > 0"
      :class="['text-gray-500', sizeClasses.text]"
    >
      {{ localInterestedCount }}
    </span>

    <!-- Going button (hidden in progressive mode until user clicks Interested) -->
    <template v-if="showGoingButton">
      <UTooltip
        v-if="!showLabels"
        :text="goingTooltip"
      >
        <button
          type="button"
          :class="[
            'rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 flex items-center justify-center',
            sizeClasses.button,
            going
              ? 'text-green-500 hover:text-green-600'
              : 'text-gray-400 hover:text-green-400',
            !loggedIn && 'opacity-75',
          ]"
          :disabled="toggling"
          @click.prevent.stop="handleGoing"
        >
          <UIcon
            :name="going ? 'i-heroicons-check-circle-solid' : 'i-heroicons-check-circle'"
            :class="[sizeClasses.icon, toggling && 'animate-pulse']"
          />
        </button>
      </UTooltip>
      <button
        v-else
        type="button"
        :class="[
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
          going
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          !loggedIn && 'opacity-75',
        ]"
        :disabled="toggling"
        @click.prevent.stop="handleGoing"
      >
        <UIcon
          :name="going ? 'i-heroicons-check-circle-solid' : 'i-heroicons-check-circle'"
          :class="['w-4 h-4', toggling && 'animate-pulse']"
        />
        Going
      </button>
      <span
        v-if="showCounts && localGoingCount > 0"
        :class="['text-gray-500', sizeClasses.text]"
      >
        {{ localGoingCount }}
      </span>
    </template>
  </div>
</template>
