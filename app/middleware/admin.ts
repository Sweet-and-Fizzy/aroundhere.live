export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  const role = user.value?.role as string
  if (role !== 'ADMIN' && role !== 'MODERATOR') {
    return navigateTo('/')
  }
})
