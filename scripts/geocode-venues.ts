/**
 * Geocode Venues Script
 *
 * Uses Google Maps Geocoding API for accurate address geocoding.
 * Requires GOOGLE_MAPS_API_KEY environment variable.
 *
 * Usage:
 *   npx tsx scripts/geocode-venues.ts                    # Check all venues
 *   npx tsx scripts/geocode-venues.ts --update           # Update database
 *   npx tsx scripts/geocode-venues.ts --address "123 Main St, City, State ZIP"
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY

interface GeocodedResult {
  lat: number
  lng: number
  formattedAddress: string
  placeId: string
}

/**
 * Geocode an address using Google Maps Geocoding API
 */
async function geocodeAddress(address: string): Promise<GeocodedResult | null> {
  if (!GOOGLE_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY environment variable is required')
    process.exit(1)
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`

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
 * Calculate distance between two coordinates in meters
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

async function checkAllVenues(update: boolean = false) {
  const venues = await prisma.venue.findMany({
    orderBy: { name: 'asc' },
  })

  console.log(`\nChecking ${venues.length} venues...\n`)
  console.log('='.repeat(80))

  let okCount = 0
  let needsUpdateCount = 0
  let notFoundCount = 0
  let updatedCount = 0

  for (const venue of venues) {
    const fullAddress = `${venue.address}, ${venue.city}, ${venue.state} ${venue.postalCode}`
    const geocoded = await geocodeAddress(fullAddress)

    const currentLat = Number(venue.latitude) || 0
    const currentLng = Number(venue.longitude) || 0

    let distance: number | null = null
    let needsUpdate = false

    if (geocoded) {
      distance = haversineDistance(currentLat, currentLng, geocoded.lat, geocoded.lng)
      needsUpdate = distance > 50 // More than 50 meters off
    }

    // Print result
    const status = !geocoded
      ? '? NOT FOUND'
      : needsUpdate
        ? `! OFF BY ${Math.round(distance!)}m`
        : 'OK'

    console.log(`${venue.name}`)
    console.log(`  Address: ${fullAddress}`)
    console.log(`  Current: ${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`)
    if (geocoded) {
      console.log(`  Google:  ${geocoded.lat.toFixed(6)}, ${geocoded.lng.toFixed(6)}`)
      console.log(`  Matched: ${geocoded.formattedAddress}`)
      console.log(`  Distance: ${Math.round(distance!)}m`)
    }
    console.log(`  Status: ${status}`)

    // Update if requested
    if (update && geocoded && needsUpdate) {
      await prisma.venue.update({
        where: { id: venue.id },
        data: {
          latitude: geocoded.lat,
          longitude: geocoded.lng,
        },
      })
      console.log(`  -> UPDATED!`)
      updatedCount++
    }

    console.log('')

    // Count results
    if (!geocoded) {
      notFoundCount++
    } else if (needsUpdate) {
      needsUpdateCount++
    } else {
      okCount++
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  // Summary
  console.log('='.repeat(80))
  console.log('\nSUMMARY:')
  console.log(`  OK: ${okCount}`)
  console.log(`  Needs Update: ${needsUpdateCount}`)
  console.log(`  Not Found: ${notFoundCount}`)

  if (update) {
    console.log(`  Updated: ${updatedCount}`)
  } else if (needsUpdateCount > 0) {
    console.log('\nRun with --update flag to update coordinates in the database.')
  }
}

async function geocodeSingleAddress(address: string) {
  console.log(`\nGeocoding: ${address}\n`)

  const result = await geocodeAddress(address)

  if (result) {
    console.log('Result:')
    console.log(`  Latitude: ${result.lat}`)
    console.log(`  Longitude: ${result.lng}`)
    console.log(`  Formatted: ${result.formattedAddress}`)
    console.log(`  Place ID: ${result.placeId}`)
    console.log('\nFor seed.ts:')
    console.log(`  latitude: ${result.lat},`)
    console.log(`  longitude: ${result.lng},`)
  } else {
    console.log('Address not found.')
  }
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error('Error: GOOGLE_MAPS_API_KEY environment variable is required.')
    console.error('Get an API key from: https://console.cloud.google.com/apis/credentials')
    console.error('Enable the Geocoding API and add the key to your .env file.')
    process.exit(1)
  }

  const args = process.argv.slice(2)

  if (args.includes('--address')) {
    const addressIndex = args.indexOf('--address')
    const address = args[addressIndex + 1]
    if (!address) {
      console.error('Please provide an address after --address')
      process.exit(1)
    }
    await geocodeSingleAddress(address)
  } else {
    const update = args.includes('--update')
    await checkAllVenues(update)
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
