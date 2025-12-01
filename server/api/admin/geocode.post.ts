import { geocodeAddress, buildFullAddress } from '../../services/geocoding'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const { address, city, state, postalCode } = body

  if (!address || !city || !state) {
    throw createError({
      statusCode: 400,
      message: 'Address, city, and state are required',
    })
  }

  const fullAddress = buildFullAddress({ address, city, state, postalCode })
  const result = await geocodeAddress(fullAddress)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: 'Could not geocode this address',
    })
  }

  return result
})
