/**
 * IP Geolocation Service
 * Uses ip-api.com (free, no API key required, 45 requests/minute limit)
 */

interface IpGeoResult {
  lat: number
  lng: number
  city?: string
  region?: string
  country?: string
}

export async function getLocationFromIp(ip: string): Promise<IpGeoResult | null> {
  // Skip local/private IPs
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null
  }

  try {
    // ip-api.com is free and doesn't require an API key
    // Limit: 45 requests per minute
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon,city,regionName,country`)

    if (!response.ok) {
      console.warn(`IP geolocation failed for ${ip}: ${response.status}`)
      return null
    }

    const data = await response.json()

    if (data.status !== 'success') {
      return null
    }

    return {
      lat: data.lat,
      lng: data.lon,
      city: data.city,
      region: data.regionName,
      country: data.country,
    }
  } catch (error) {
    console.error('IP geolocation error:', error)
    return null
  }
}
