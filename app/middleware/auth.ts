export default defineNuxtRouteMiddleware(async () => {
  // Only run on client side
  if (import.meta.server) return

  // This middleware is applied via definePageMeta({ middleware: ['auth'] })
  // so we always check authentication when this middleware runs
  try {
    await $fetch('/api/auth/me')
  } catch {
    // User is not authenticated, redirect to login
    return navigateTo('/login')
  }
})
