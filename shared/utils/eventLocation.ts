// Community submissions may have a free-text location instead of a venue
export interface EventLocationFields {
  venue?: { name: string, city?: string | null } | null
  locationName?: string | null
  locationCity?: string | null
}

export function eventLocationName(event: EventLocationFields): string | null {
  return event.venue?.name || event.locationName || null
}

export function eventLocationCity(event: EventLocationFields): string | null {
  return event.venue?.city || event.locationCity || null
}
