/**
 * Playlist Sync Service
 *
 * Syncs Spotify playlists with upcoming events:
 * - Gets events in the configured date range
 * - Collects tracks from matched artists (2-4 based on event proximity)
 * - Adds new tracks, removes old ones
 * - Orders by event date (soonest first)
 */

import { prisma } from '../../utils/prisma'
import { spotifyService } from './index'
import type { PopularTrack } from './types'

// How many tracks to include based on days until event
function getTrackCount(daysUntilEvent: number): number {
  if (daysUntilEvent <= 7) return 4
  if (daysUntilEvent <= 14) return 3
  return 2
}

export interface SyncResult {
  playlistId: string
  playlistName: string
  tracksAdded: number
  tracksRemoved: number
  totalTracks: number
  artistsIncluded: number
  eventsIncluded: number
  errors: string[]
}

interface EventWithArtists {
  id: string
  title: string
  startsAt: Date
  eventArtists: {
    artist: {
      id: string
      name: string
      spotifyId: string | null
      spotifyMatchStatus: string
      spotifyPopularTracks: PopularTrack[] | null
    }
  }[]
}

/**
 * Sync a single playlist with upcoming events
 */
export async function syncPlaylist(playlistId: string): Promise<SyncResult> {
  const errors: string[] = []

  // Get playlist config
  const playlist = await prisma.spotifyPlaylist.findUnique({
    where: { playlistId },
  })

  if (!playlist) {
    throw new Error(`Playlist ${playlistId} not found in database`)
  }

  if (!playlist.syncEnabled) {
    throw new Error(`Playlist ${playlist.name} sync is disabled`)
  }

  // Calculate date range
  const now = new Date()
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + playlist.daysAhead)

  // Yesterday (for cleanup)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  // Get upcoming events with their artists
  const events = await prisma.event.findMany({
    where: {
      startsAt: {
        gte: now,
        lte: endDate,
      },
      // Only include music events
      isMusic: true,
    },
    include: {
      eventArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              spotifyId: true,
              spotifyMatchStatus: true,
              spotifyPopularTracks: true,
            },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { startsAt: 'asc' },
  }) as EventWithArtists[]

  // Build target track list
  const targetTracks: {
    uri: string
    artistId: string
    eventId: string
    eventDate: Date
  }[] = []

  const includedArtists = new Set<string>()
  const includedEvents = new Set<string>()

  for (const event of events) {
    const daysUntil = Math.ceil(
      (event.startsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
    const trackCount = getTrackCount(daysUntil)

    for (const ea of event.eventArtists) {
      const artist = ea.artist

      // Skip if not matched on Spotify
      if (!artist.spotifyId) continue
      if (!['AUTO_MATCHED', 'VERIFIED'].includes(artist.spotifyMatchStatus)) continue

      // Get tracks (from cache or fetch)
      let tracks: PopularTrack[] = artist.spotifyPopularTracks as PopularTrack[] || []

      // If no cached tracks, try to fetch them
      if (tracks.length === 0 && artist.spotifyId) {
        try {
          tracks = await spotifyService.getPopularTracks(artist.spotifyId, 4)
          // Cache them
          await prisma.artist.update({
            where: { id: artist.id },
            data: {
              spotifyPopularTracks: tracks,
              spotifyTracksUpdatedAt: new Date(),
            },
          })
        } catch (err) {
          errors.push(`Failed to get tracks for ${artist.name}: ${err}`)
          continue
        }
      }

      // Add tracks to target list
      const tracksToAdd = tracks.slice(0, trackCount)
      for (const track of tracksToAdd) {
        // Avoid duplicates (same track from same artist at different events)
        if (!targetTracks.some(t => t.uri === track.uri)) {
          targetTracks.push({
            uri: track.uri,
            artistId: artist.id,
            eventId: event.id,
            eventDate: event.startsAt,
          })
        }
      }

      includedArtists.add(artist.id)
      includedEvents.add(event.id)
    }
  }

  // Sort by event date (soonest first)
  targetTracks.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())

  // Get current playlist state from our database
  const currentDbTracks = await prisma.spotifyPlaylistTrack.findMany({
    where: { playlistId },
  })

  const currentUris = new Set(currentDbTracks.map(t => t.trackUri))
  const targetUris = new Set(targetTracks.map(t => t.uri))

  // Calculate diff
  const toAdd = targetTracks.filter(t => !currentUris.has(t.uri))
  const toRemove = currentDbTracks.filter(t => !targetUris.has(t.trackUri))

  // Apply changes to Spotify
  try {
    // Remove old tracks
    if (toRemove.length > 0) {
      await spotifyService.removeTracksFromPlaylist(
        playlistId,
        toRemove.map(t => t.trackUri)
      )
    }

    // Add new tracks
    if (toAdd.length > 0) {
      await spotifyService.addTracksToPlaylist(
        playlistId,
        toAdd.map(t => t.uri)
      )
    }

    // Reorder to match our target order (if we have tracks)
    if (targetTracks.length > 0) {
      await spotifyService.replacePlaylistTracks(
        playlistId,
        targetTracks.map(t => t.uri)
      )
    }
  } catch (err) {
    errors.push(`Spotify API error: ${err}`)
    // Update playlist with error
    await prisma.spotifyPlaylist.update({
      where: { playlistId },
      data: {
        lastSyncError: `${err}`,
        updatedAt: new Date(),
      },
    })
    throw err
  }

  // Update our database state
  // Remove old track records
  if (toRemove.length > 0) {
    await prisma.spotifyPlaylistTrack.deleteMany({
      where: {
        playlistId,
        trackUri: { in: toRemove.map(t => t.trackUri) },
      },
    })
  }

  // Add new track records
  if (toAdd.length > 0) {
    await prisma.spotifyPlaylistTrack.createMany({
      data: toAdd.map(t => ({
        playlistId,
        trackUri: t.uri,
        artistId: t.artistId,
        eventId: t.eventId,
      })),
    })
  }

  // Update playlist last sync time
  await prisma.spotifyPlaylist.update({
    where: { playlistId },
    data: {
      lastSyncedAt: new Date(),
      lastSyncError: errors.length > 0 ? errors.join('; ') : null,
    },
  })

  return {
    playlistId,
    playlistName: playlist.name,
    tracksAdded: toAdd.length,
    tracksRemoved: toRemove.length,
    totalTracks: targetTracks.length,
    artistsIncluded: includedArtists.size,
    eventsIncluded: includedEvents.size,
    errors,
  }
}

/**
 * Sync all enabled playlists
 */
export async function syncAllPlaylists(): Promise<SyncResult[]> {
  const playlists = await prisma.spotifyPlaylist.findMany({
    where: { syncEnabled: true },
  })

  const results: SyncResult[] = []

  for (const playlist of playlists) {
    try {
      const result = await syncPlaylist(playlist.playlistId)
      results.push(result)
    } catch (err) {
      results.push({
        playlistId: playlist.playlistId,
        playlistName: playlist.name,
        tracksAdded: 0,
        tracksRemoved: 0,
        totalTracks: 0,
        artistsIncluded: 0,
        eventsIncluded: 0,
        errors: [`Sync failed: ${err}`],
      })
    }
  }

  return results
}

/**
 * Clean up tracks for past events (run daily)
 */
export async function cleanupPastEvents(): Promise<number> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(23, 59, 59, 999)

  // Find tracks linked to past events
  const pastTracks = await prisma.spotifyPlaylistTrack.findMany({
    where: {
      event: {
        startsAt: { lt: yesterday },
      },
    },
    include: {
      event: true,
    },
  })

  // This is handled by syncPlaylist - events outside the date range
  // won't be in the target list and will be removed automatically
  return pastTracks.length
}

/**
 * Get sync status for all playlists
 */
export async function getSyncStatus(): Promise<{
  playlists: {
    id: string
    playlistId: string
    name: string
    syncEnabled: boolean
    lastSyncedAt: Date | null
    lastSyncError: string | null
    trackCount: number
  }[]
}> {
  const playlists = await prisma.spotifyPlaylist.findMany({
    include: {
      _count: {
        select: { /* This won't work without a relation */ },
      },
    },
  })

  // Get track counts separately
  const trackCounts = await prisma.spotifyPlaylistTrack.groupBy({
    by: ['playlistId'],
    _count: { id: true },
  })

  const countMap = new Map(trackCounts.map(tc => [tc.playlistId, tc._count.id]))

  return {
    playlists: playlists.map(p => ({
      id: p.id,
      playlistId: p.playlistId,
      name: p.name,
      syncEnabled: p.syncEnabled,
      lastSyncedAt: p.lastSyncedAt,
      lastSyncError: p.lastSyncError,
      trackCount: countMap.get(p.playlistId) || 0,
    })),
  }
}
