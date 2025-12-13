/**
 * Test script for venue clustering
 * Run with: npx tsx scripts/test-clustering.ts
 */

import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { clusterVenues, dbscan, type VenuePoint } from '../server/services/clustering'

async function main() {
  console.log('Testing venue clustering...\n')

  // First, let's see what venues we have
  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
    },
  })

  console.log(`Found ${venues.length} venues with coordinates:\n`)

  const points: VenuePoint[] = venues.map(v => ({
    id: v.id,
    name: v.name,
    city: v.city,
    state: v.state,
    lat: v.latitude!,
    lng: v.longitude!,
  }))

  // Show venues by state
  const byState = points.reduce((acc, v) => {
    const state = v.state || 'Unknown'
    acc[state] = (acc[state] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('Venues by state:', byState)
  console.log('')

  // Run clustering (without AI naming for quick test)
  console.log('Running DBSCAN clustering (epsilon=15mi, minVenues=3)...\n')

  const { clusters, orphans } = dbscan(points, {
    epsilonMiles: 15,
    minVenues: 3,
    maxOrphanDistance: 30,
  })

  console.log(`Found ${clusters.length} cluster(s) and ${orphans.length} orphan(s)\n`)

  clusters.forEach((cluster, i) => {
    console.log(`Cluster ${i + 1}:`)
    console.log(`  Centroid: ${cluster.centroid.lat.toFixed(4)}, ${cluster.centroid.lng.toFixed(4)}`)
    console.log(`  Cities: ${cluster.cities.join(', ')}`)
    console.log(`  States: ${cluster.states.join(', ')}`)
    console.log(`  Venues (${cluster.venues.length}):`)
    cluster.venues.forEach(v => {
      console.log(`    - ${v.name} (${v.city}, ${v.state})`)
    })
    console.log('')
  })

  if (orphans.length > 0) {
    console.log('Orphan venues (not in any cluster):')
    orphans.forEach(v => {
      console.log(`  - ${v.name} (${v.city}, ${v.state})`)
    })
    console.log('')
  }

  // Now run full clustering with AI naming
  console.log('Running full clustering with AI naming (epsilon=15mi)...\n')

  try {
    const result = await clusterVenues(prisma, {
      epsilonMiles: 15,
      minVenues: 3,
      maxOrphanDistance: 30,
    })

    console.log('Results:')
    console.log(`  Total venues: ${result.stats.totalVenues}`)
    console.log(`  Clustered: ${result.stats.clusteredVenues}`)
    console.log(`  Regions: ${result.stats.regionCount}`)
    console.log('')

    result.regions.forEach(region => {
      console.log(`Region: "${region.name}" (${region.slug})`)
      console.log(`  Centroid: ${region.centroid.lat.toFixed(4)}, ${region.centroid.lng.toFixed(4)}`)
      console.log(`  Venues: ${region.venues.length}`)
      console.log(`  Cities: ${region.cities.join(', ')}`)
      console.log('')
    })

    if (result.unassigned.length > 0) {
      console.log('Unassigned venues:')
      result.unassigned.forEach(v => {
        console.log(`  - ${v.name} (${v.city}, ${v.state})`)
      })
    }
  } catch (error) {
    console.error('Clustering failed:', error)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
