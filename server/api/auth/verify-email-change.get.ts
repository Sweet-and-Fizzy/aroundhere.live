import { sendRedirect } from 'h3'
import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  // Find the token
  const loginToken = await prisma.loginToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!loginToken) {
    throw createError({
      statusCode: 400,
      message: 'Invalid or expired token',
    })
  }

  // Check if it's an email change token
  if (!loginToken.email?.startsWith('change:')) {
    throw createError({
      statusCode: 400,
      message: 'Invalid token type',
    })
  }

  // Check expiration
  if (loginToken.expiresAt < new Date()) {
    await prisma.loginToken.delete({ where: { id: loginToken.id } })
    throw createError({
      statusCode: 400,
      message: 'Token has expired',
    })
  }

  // Extract the new email
  const newEmail = loginToken.email!.replace('change:', '')

  // Check if email is still available (in case someone else took it)
  const existingUser = await prisma.user.findUnique({
    where: { email: newEmail },
  })

  if (existingUser && existingUser.id !== loginToken.userId) {
    await prisma.loginToken.delete({ where: { id: loginToken.id } })
    throw createError({
      statusCode: 400,
      message: 'This email address is no longer available',
    })
  }

  // Ensure token has a user
  if (!loginToken.userId) {
    throw createError({
      statusCode: 400,
      message: 'Invalid token - no associated user',
    })
  }

  // Update the user's email
  await prisma.user.update({
    where: { id: loginToken.userId },
    data: { email: newEmail },
  })

  // Delete the token
  await prisma.loginToken.delete({ where: { id: loginToken.id } })

  // Update the session with the new email
  const session = await getUserSession(event)
  if (session?.user) {
    await setUserSession(event, {
      user: {
        ...session.user,
        email: newEmail,
      },
    })
  }

  // Redirect to settings with success message
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  return sendRedirect(event, `${baseUrl}/settings?emailChanged=true`)
})
