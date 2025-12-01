import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Venue ID is required',
    })
  }

  const venue = await prisma.venue.findUnique({
    where: { id },
  })

  if (!venue) {
    throw createError({
      statusCode: 404,
      message: 'Venue not found',
    })
  }

  const updated = await prisma.venue.update({
    where: { id },
    data: {
      name: body.name,
      slug: body.slug,
      address: body.address,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      website: body.website,
      phone: body.phone,
      description: body.description,
      venueType: body.venueType,
      capacity: body.capacity ? parseInt(body.capacity) : null,
      latitude: body.latitude ? parseFloat(body.latitude) : null,
      longitude: body.longitude ? parseFloat(body.longitude) : null,
      logoUrl: body.logoUrl || null,
      imageUrl: body.imageUrl || null,
      isActive: body.isActive,
    },
  })

  return updated
})
