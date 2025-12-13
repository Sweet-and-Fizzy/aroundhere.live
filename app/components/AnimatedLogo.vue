<script setup lang="ts">
const props = defineProps<{
  playing?: boolean
  width?: number | string
  height?: number | string
}>()

// Define the VU meter bar stacks - each stack has bars from bottom (green) to top (red)
// Positions calculated to center each stack in the gap between waveform lines
// Gap centers: 55-67=61, 80.1-93.3=86.7, 93.3-107.8=100.55, 134.6-148.9=141.75, 161.7-175.7=168.7, 188.7-201.4=195.05
const stacks = [
  {
    x: 58.75,  // Centered in gap 55-67 (center 61, width 4.5)
    width: 4.5,
    bars: [
      { y: 71.4, color: '#09ff16' },
      { y: 61.9, color: '#09ff16' },
      { y: 52.4, color: '#09ff16' },
      { y: 42.9, color: '#fffc44' },
      { y: 33.4, color: '#eb6400' },
      { y: 24.5, color: '#eb3200' },
    ],
  },
  {
    x: 84.45,  // Centered in gap 80.1-93.3 (center 86.7, width 4.5)
    width: 4.5,
    bars: [
      { y: 82.4, color: '#09ff16' },
      { y: 73, color: '#09ff16' },
      { y: 63.5, color: '#09ff16' },
      { y: 54, color: '#09ff16' },
      { y: 44.5, color: '#09ff16' },
      { y: 35, color: '#fffc44' },
      { y: 25.5, color: '#fffc44' },
      { y: 16, color: '#eb6400' },
      { y: 6.5, color: '#eb3200' },
    ],
  },
  {
    x: 112.25,  // Centered in gap 107.8-121.2 (center 114.5, width 4.5)
    width: 4.5,
    bars: [
      { y: 78, color: '#09ff16' },
      { y: 68.5, color: '#09ff16' },
      { y: 59, color: '#fffc44' },
      { y: 49.5, color: '#eb6400' },
    ],
  },
  {
    x: 139.5,  // Centered in gap 134.6-148.9 (center 141.75, width 4.5)
    width: 4.5,
    bars: [
      { y: 69.9, color: '#09ff16' },
      { y: 60.4, color: '#09ff16' },
      { y: 50.9, color: '#fffc44' },
      { y: 41.4, color: '#eb6400' },
      { y: 31.9, color: '#eb3200' },
    ],
  },
  {
    x: 166.15,  // Centered in gap 161.7-175.7 (center 168.7, width 5.1)
    width: 5.1,
    bars: [
      { y: 82.4, color: '#09ff16' },
      { y: 73, color: '#09ff16' },
      { y: 63.5, color: '#09ff16' },
      { y: 54, color: '#09ff16' },
      { y: 44.5, color: '#09ff16' },
      { y: 35, color: '#fffc44' },
      { y: 25.5, color: '#fffc44' },
      { y: 16, color: '#eb6400' },
      { y: 6.5, color: '#eb3200' },
    ],
  },
  {
    x: 192.8,  // Centered in gap 188.7-201.4 (center 195.05, width 4.5)
    width: 4.5,
    bars: [
      { y: 73.5, color: '#09ff16' },
      { y: 63.5, color: '#09ff16' },
      { y: 54, color: '#09ff16' },
      { y: 44.5, color: '#fffc44' },
      { y: 35, color: '#eb6400' },
      { y: 25.5, color: '#eb3200' },
    ],
  },
]

// Random levels for each stack (0-1, representing how "full" the meter is)
const levels = ref<number[]>(stacks.map(() => Math.random() * 0.6 + 0.2))

// Animation interval
let animationInterval: ReturnType<typeof setInterval> | null = null

function updateLevels() {
  levels.value = levels.value.map((level) => {
    // Create organic movement - tendency to stay near current level with occasional jumps
    const change = (Math.random() - 0.5) * 0.4
    const newLevel = level + change
    // Clamp between 0.1 and 1, with bias toward middle values
    return Math.max(0.1, Math.min(1, newLevel))
  })
}

// Check if a bar should be visible based on its position in the stack
function isBarVisible(stackIndex: number, barIndex: number): boolean {
  if (!props.playing) return true // Show all bars when not animating
  const stack = stacks[stackIndex]
  if (!stack) return false
  const level = levels.value[stackIndex] ?? 0.5
  const threshold = barIndex / stack.bars.length
  return threshold < level
}

// Start/stop animation based on playing prop (client-side only)
watch(
  () => props.playing,
  (playing) => {
    if (!import.meta.client) return
    if (playing) {
      // Start animation
      updateLevels()
      animationInterval = setInterval(updateLevels, 150)
    } else {
      // Stop animation
      if (animationInterval) {
        clearInterval(animationInterval)
        animationInterval = null
      }
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (animationInterval) {
    clearInterval(animationInterval)
  }
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 253.1 103"
    :width="width"
    :height="height"
  >
    <!-- The waveform line -->
    <polyline
      fill="none"
      stroke="#f9fafb"
      stroke-miterlimit="10"
      stroke-width="3.3"
      points="0 57 28.1 57 28.1 36.5 41.3 36.5 41.3 79.3 55 79.3 55 20.5 67 20.5 67 101.4 80.1 101.4 80.1 1.6 93.3 1.6 93.3 87.3 107.8 87.3 107.8 46.7 121.2 46.7 121.2 74.4 134.6 74.4 134.6 27.9 148.9 27.9 148.9 87.3 161.7 87.3 161.7 1.6 175.7 1.6 175.7 101.4 188.7 101.4 188.7 20.5 201.4 20.5 201.4 79.6 214.3 79.6 214.3 36.1 226.8 36.1 226.8 56.8 253.1 56.8"
    />

    <!-- VU meter bar stacks -->
    <template v-for="(stack, stackIndex) in stacks" :key="stackIndex">
      <rect
        v-for="(bar, barIndex) in stack.bars"
        :key="`${stackIndex}-${barIndex}`"
        :x="stack.x"
        :y="bar.y"
        :width="stack.width"
        height="7.1"
        :fill="bar.color"
        :opacity="isBarVisible(stackIndex, barIndex) ? 1 : 0.15"
        class="vu-bar"
      />
    </template>
  </svg>
</template>

<style scoped>
.vu-bar {
  transition: opacity 0.1s ease-out;
}
</style>
