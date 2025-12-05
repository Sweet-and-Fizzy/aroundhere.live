export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (import.meta.server) return

  // Check if route requires authentication
  const requiresAuth = to.meta.requiresAuth === true

  if (requiresAuth) {
    try {
      await $fetch('/api/auth/me')
    } catch (error) {
      // User is not authenticated, redirect to login
      return navigateTo('/login')
    }
  }
})
