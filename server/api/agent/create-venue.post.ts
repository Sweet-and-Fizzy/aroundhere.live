import prisma from '../../utils/prisma'
import { createPrismaRegionStore } from '../../services/regions/store'
import { resolveRegionForVenue } from '../../services/regions/resolve'
import { geocodeAddress, buildFullAddress } from '../../services/geocoding'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { venueData } = body

  if (!venueData?.name || !venueData?.website) {
    throw createError({
      statusCode: 400,
      message: 'Name and website are required',
    })
  }

  let latitude: number | null = venueData.latitude ?? null
  let longitude: number | null = venueData.longitude ?? null
  if (latitude == null || longitude == null) {
    const fullAddress = buildFullAddress(venueData)
    const geocoded = fullAddress ? await geocodeAddress(fullAddress) : null
    if (geocoded) {
      latitude = geocoded.lat
      longitude = geocoded.lng
    }
  }

  const { regionId } = await resolveRegionForVenue(
    { store: createPrismaRegionStore(prisma) },
    { city: venueData.city, state: venueData.state, latitude, longitude },
  )
  const region = { id: regionId }

  // Generate unique slug
  let slug = generateSlug(venueData.name)
  const existingVenue = await prisma.venue.findFirst({
    where: { slug, regionId: region.id },
  })
  if (existingVenue) {
    slug = `${slug}-${Date.now()}`
  }

  // Create venue
  const venue = await prisma.venue.create({
    data: {
      name: venueData.name,
      slug,
      regionId: region.id,
      latitude,
      longitude,
      website: venueData.website,
      address: venueData.address || null,
      city: venueData.city || null,
      state: venueData.state || null,
      postalCode: venueData.postalCode || null,
      phone: venueData.phone || null,
      description: venueData.description || null,
      venueType: venueData.venueType || 'OTHER',
      capacity: venueData.capacity || null,
      logoUrl: venueData.logoUrl || null,
      imageUrl: venueData.imageUrl || null,
      isActive: true,
    },
  })

  return {
    success: true,
    venue,
  }
})
