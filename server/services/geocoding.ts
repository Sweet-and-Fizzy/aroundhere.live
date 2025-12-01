/**
 * Geocoding Service
 * Uses Google Maps Geocoding API to convert addresses to coordinates
 */

export interface GeocodedResult {
  lat: number
  lng: number
  formattedAddress: string
  placeId: string
}

/**
 * Geocode an address using Google Maps Geocoding API
 */
export async function geocodeAddress(address: string): Promise<GeocodedResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY not configured, skipping geocoding')
    return null
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0]
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
      }
    }

    if (data.status === 'ZERO_RESULTS') {
      console.warn(`Geocoding found no results for address: ${address}`)
      return null
    }

    console.error(`Geocoding error: ${data.status}`, data.error_message || '')
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

/**
 * Build full address string from venue data
 */
export function buildFullAddress(data: {
  address?: string
  city?: string
  state?: string
  postalCode?: string
}): string {
  const parts = [data.address, data.city, data.state, data.postalCode].filter(Boolean)
  return parts.join(', ')
}
