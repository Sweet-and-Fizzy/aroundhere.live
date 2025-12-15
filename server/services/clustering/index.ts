/**
 * Venue Clustering Service
 * Uses DBSCAN algorithm to group venues into geographic regions
 */

import type { PrismaClient } from '@prisma/client'
import { llmService } from '../llm'

// Approximate miles per degree at mid-latitudes (kept for reference)
// const MILES_PER_DEGREE_LAT = 69
// const MILES_PER_DEGREE_LNG = 54.6 // varies with latitude, ~55 at 42°N

export interface ClusterConfig {
  epsilonMiles: number      // Max distance between venues to be in same cluster
  minVenues: number         // Minimum venues to form a region
  maxOrphanDistance: number // Max distance for orphan to join nearest cluster
  maxRegionRadius: number   // Max distance from centroid - prevents elongated regions
}

export interface VenuePoint {
  id: string
  name: string
  city: string | null
  state: string | null
  lat: number
  lng: number
}

export interface Cluster {
  venues: VenuePoint[]
  centroid: { lat: number; lng: number }
  cities: string[]
  states: string[]
}

export interface NamedCluster extends Cluster {
  name: string
  slug: string
}

const DEFAULT_CONFIG: ClusterConfig = {
  epsilonMiles: 15,       // Max distance between venues to be in same cluster
  minVenues: 3,           // Minimum venues to form a region
  maxOrphanDistance: 20,  // Max distance for orphan to join nearest cluster
  maxRegionRadius: 35,    // Max distance from centroid - prevents elongated regions
}

/**
 * Calculate distance between two points in miles using Haversine formula
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * DBSCAN clustering algorithm
 * Returns clusters and orphan points (not in any cluster)
 */
export function dbscan(
  points: VenuePoint[],
  config: ClusterConfig = DEFAULT_CONFIG
): { clusters: Cluster[]; orphans: VenuePoint[] } {
  const { epsilonMiles, minVenues } = config

  const visited = new Set<string>()
  const clustered = new Set<string>()
  const clusters: Cluster[] = []

  // Find all neighbors within epsilon distance
  function regionQuery(point: VenuePoint): VenuePoint[] {
    return points.filter(p =>
      p.id !== point.id &&
      haversineDistance(point.lat, point.lng, p.lat, p.lng) <= epsilonMiles
    )
  }

  // Expand cluster from a core point
  function expandCluster(point: VenuePoint, neighbors: VenuePoint[], cluster: VenuePoint[]): void {
    cluster.push(point)
    clustered.add(point.id)

    const queue = [...neighbors]

    while (queue.length > 0) {
      const current = queue.shift()!

      if (!visited.has(current.id)) {
        visited.add(current.id)
        const currentNeighbors = regionQuery(current)

        // If this point is also a core point, add its neighbors to the queue
        if (currentNeighbors.length >= minVenues - 1) {
          for (const neighbor of currentNeighbors) {
            if (!clustered.has(neighbor.id)) {
              queue.push(neighbor)
            }
          }
        }
      }

      if (!clustered.has(current.id)) {
        cluster.push(current)
        clustered.add(current.id)
      }
    }
  }

  // Main DBSCAN loop
  for (const point of points) {
    if (visited.has(point.id)) continue

    visited.add(point.id)
    const neighbors = regionQuery(point)

    // Need minVenues - 1 neighbors (plus the point itself) to be a core point
    if (neighbors.length >= minVenues - 1) {
      const cluster: VenuePoint[] = []
      expandCluster(point, neighbors, cluster)

      if (cluster.length >= minVenues) {
        // Calculate centroid
        const centroid = {
          lat: cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length,
          lng: cluster.reduce((sum, p) => sum + p.lng, 0) / cluster.length,
        }

        // Collect unique cities and states
        const cities = [...new Set(cluster.map(v => v.city).filter(Boolean) as string[])]
        const states = [...new Set(cluster.map(v => v.state).filter(Boolean) as string[])]

        clusters.push({ venues: cluster, centroid, cities, states })
      }
    }
  }

  // Find orphans (points not in any cluster)
  const orphans = points.filter(p => !clustered.has(p.id))

  return { clusters, orphans }
}

/**
 * Assign orphan venues to nearest cluster if within maxOrphanDistance
 */
export function assignOrphans(
  clusters: Cluster[],
  orphans: VenuePoint[],
  maxDistance: number
): { clusters: Cluster[]; unassigned: VenuePoint[] } {
  const unassigned: VenuePoint[] = []

  for (const orphan of orphans) {
    let nearestCluster: Cluster | null = null
    let nearestDistance = Infinity

    for (const cluster of clusters) {
      const distance = haversineDistance(
        orphan.lat, orphan.lng,
        cluster.centroid.lat, cluster.centroid.lng
      )

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestCluster = cluster
      }
    }

    if (nearestCluster && nearestDistance <= maxDistance) {
      nearestCluster.venues.push(orphan)
      if (orphan.city && !nearestCluster.cities.includes(orphan.city)) {
        nearestCluster.cities.push(orphan.city)
      }
      if (orphan.state && !nearestCluster.states.includes(orphan.state)) {
        nearestCluster.states.push(orphan.state)
      }
      // Recalculate centroid
      nearestCluster.centroid = {
        lat: nearestCluster.venues.reduce((sum, p) => sum + p.lat, 0) / nearestCluster.venues.length,
        lng: nearestCluster.venues.reduce((sum, p) => sum + p.lng, 0) / nearestCluster.venues.length,
      }
    } else {
      unassigned.push(orphan)
    }
  }

  return { clusters, unassigned }
}

/**
 * Enforce max region radius - removes venues too far from centroid
 * This prevents elongated regions from DBSCAN chaining
 */
export function enforceMaxRadius(
  clusters: Cluster[],
  maxRadius: number
): { clusters: Cluster[]; ejected: VenuePoint[] } {
  const ejected: VenuePoint[] = []

  for (const cluster of clusters) {
    // Find venues beyond max radius
    const tooFar: VenuePoint[] = []
    const remaining: VenuePoint[] = []

    for (const venue of cluster.venues) {
      const distance = haversineDistance(
        venue.lat, venue.lng,
        cluster.centroid.lat, cluster.centroid.lng
      )
      if (distance > maxRadius) {
        tooFar.push(venue)
      } else {
        remaining.push(venue)
      }
    }

    // If we ejected any venues, update the cluster
    if (tooFar.length > 0) {
      ejected.push(...tooFar)
      cluster.venues = remaining

      // Recalculate centroid and metadata
      if (remaining.length > 0) {
        cluster.centroid = {
          lat: remaining.reduce((sum, p) => sum + p.lat, 0) / remaining.length,
          lng: remaining.reduce((sum, p) => sum + p.lng, 0) / remaining.length,
        }
        cluster.cities = [...new Set(remaining.map(v => v.city).filter(Boolean) as string[])]
        cluster.states = [...new Set(remaining.map(v => v.state).filter(Boolean) as string[])]
      }
    }
  }

  // Remove empty clusters
  const validClusters = clusters.filter(c => c.venues.length > 0)

  return { clusters: validClusters, ejected }
}

/**
 * Use AI to generate a culturally-appropriate name for a cluster
 */
export async function nameCluster(cluster: Cluster): Promise<{ name: string; slug: string }> {
  const venueList = cluster.venues
    .map(v => `- ${v.name}, ${v.city}, ${v.state}`)
    .join('\n')

  const prompt = `These music venues are geographically clustered together:

${venueList}

Cities in this cluster: ${cluster.cities.join(', ')}
States in this cluster: ${cluster.states.join(', ')}

What is the commonly-used regional name for this area? The name will be used in phrases like "events in [region]" so it must:
- Work grammatically after "in" - include "the" if needed (e.g., "the Pioneer Valley", "the Berkshires", "the Bay Area")
- Some regions don't need "the" (e.g., "Western Massachusetts", "Southern Vermont")
- Be a recognizable local/colloquial name people actually use
- If no well-known regional name exists, use a simple geographic descriptor
- Be short (2-4 words max, not counting "the")

Return ONLY the region name exactly as it should appear after "in", nothing else.`

  try {
    const response = await llmService.complete({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
      temperature: 0.3,
    })

    const name = response.content.trim()
    // Normalize slug: strip leading "the " to avoid duplicates like "pioneer-valley" vs "the-pioneer-valley"
    const slug = name
      .toLowerCase()
      .replace(/^the\s+/, '') // Remove leading "the "
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

    return { name, slug }
  } catch (error) {
    console.error('[Clustering] Failed to name cluster:', error)
    // Fallback: use primary city and state
    const fallbackName = cluster.cities[0] && cluster.states[0]
      ? `${cluster.cities[0]} Area`
      : 'Unnamed Region'
    const slug = fallbackName.toLowerCase().replace(/\s+/g, '-')
    return { name: fallbackName, slug }
  }
}

/**
 * Main function: cluster venues and generate named regions
 */
export async function clusterVenues(
  prisma: PrismaClient,
  config: ClusterConfig = DEFAULT_CONFIG
): Promise<{
  regions: NamedCluster[]
  unassigned: VenuePoint[]
  stats: { totalVenues: number; clusteredVenues: number; regionCount: number }
}> {
  // Fetch all active venues with coordinates
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

  const points: VenuePoint[] = venues
    .filter(v => v.latitude && v.longitude)
    .map(v => ({
      id: v.id,
      name: v.name,
      city: v.city,
      state: v.state,
      lat: v.latitude!,
      lng: v.longitude!,
    }))

  console.log(`[Clustering] Processing ${points.length} venues...`)

  // Run DBSCAN
  const { clusters: rawClusters, orphans: initialOrphans } = dbscan(points, config)
  console.log(`[Clustering] Found ${rawClusters.length} clusters, ${initialOrphans.length} orphans`)

  // Enforce max radius to prevent elongated regions from DBSCAN chaining
  const { clusters, ejected } = enforceMaxRadius(rawClusters, config.maxRegionRadius)
  const orphans = [...initialOrphans, ...ejected]
  if (ejected.length > 0) {
    console.log(`[Clustering] Ejected ${ejected.length} venues too far from centroids`)
  }

  // Assign orphans to nearest cluster if close enough
  const { clusters: finalClusters, unassigned } = assignOrphans(
    clusters,
    orphans,
    config.maxOrphanDistance
  )
  console.log(`[Clustering] After orphan assignment: ${unassigned.length} unassigned venues`)

  // Name each cluster using AI
  const namedRegions: NamedCluster[] = []
  for (const cluster of finalClusters) {
    const { name, slug } = await nameCluster(cluster)
    namedRegions.push({ ...cluster, name, slug })
    console.log(`[Clustering] Named cluster: "${name}" (${cluster.venues.length} venues)`)
  }

  return {
    regions: namedRegions,
    unassigned,
    stats: {
      totalVenues: points.length,
      clusteredVenues: points.length - unassigned.length,
      regionCount: namedRegions.length,
    },
  }
}
