export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/login')
  }

  const role = user.value?.role as string
  if (role !== 'ADMIN' && role !== 'MODERATOR') {
    return navigateTo('/')
  }
})
