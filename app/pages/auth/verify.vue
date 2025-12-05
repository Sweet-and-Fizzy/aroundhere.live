<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div class="text-center">
        <h1 class="text-4xl font-bold text-white mb-2">
          AroundHere
        </h1>
      </div>

      <div class="bg-white rounded-lg shadow-xl p-8">
        <!-- Loading State -->
        <div
          v-if="loading"
          class="text-center py-8"
        >
          <svg
            class="animate-spin h-12 w-12 text-purple-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p class="mt-4 text-gray-600">
            Verifying your magic link...
          </p>
        </div>

        <!-- Success State -->
        <div
          v-else-if="success"
          class="text-center py-8"
        >
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg
              class="h-6 w-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 class="mt-4 text-2xl font-bold text-gray-900">
            Welcome back!
          </h2>
          <p class="mt-2 text-gray-600">
            You've been successfully logged in.
          </p>
          <p class="mt-4 text-sm text-gray-500">
            Redirecting to homepage...
          </p>
        </div>

        <!-- Error State -->
        <div
          v-else-if="error"
          class="text-center py-8"
        >
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg
              class="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 class="mt-4 text-2xl font-bold text-gray-900">
            Verification failed
          </h2>
          <p class="mt-2 text-gray-600">
            {{ error }}
          </p>
          <div class="mt-6">
            <NuxtLink
              to="/login"
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              Request a new magic link
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const success = ref(false)
const error = ref('')

onMounted(async () => {
  const token = route.query.token as string

  if (!token) {
    error.value = 'No verification token provided.'
    loading.value = false
    return
  }

  try {
    await $fetch('/api/auth/verify', {
      method: 'GET',
      query: { token },
    })

    success.value = true

    // Redirect to homepage after 2 seconds
    setTimeout(() => {
      router.push('/')
    }, 2000)
  } catch (err: any) {
    error.value = err.data?.message || 'Invalid or expired magic link. Please request a new one.'
  } finally {
    loading.value = false
  }
})
</script>
