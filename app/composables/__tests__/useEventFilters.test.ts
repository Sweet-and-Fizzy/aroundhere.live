import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useEventFilters } from '../useEventFilters'

// Stub the Nuxt auto-imports the composable uses as globals
const store = new Map<string, Ref>()
let currentQuery: Record<string, string> = {}
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!store.has(key)) store.set(key, ref(init?.()))
  return store.get(key)
})
vi.stubGlobal('useRoute', () => ({ query: currentQuery }))
vi.stubGlobal('useFavorites', () => ({ favorites: ref({ artists: [], venues: [], genres: [] }) }))
vi.stubGlobal('useCurrentRegion', () => ({ updateRegion: vi.fn() }))

const venues = [{ id: 'v1', slug: 'iron-horse' }]

beforeEach(() => {
  store.clear()
  localStorage.clear()
  currentQuery = {}
})

describe('useEventFilters', () => {
  it('restores saved filters once', () => {
    localStorage.setItem('eventFilters', JSON.stringify({ searchQuery: 'jazz' }))
    const { filters, restore, restored } = useEventFilters()
    restore(venues)
    expect(filters.value.searchQuery).toBe('jazz')
    expect(restored.value).toBe(true)
    filters.value.searchQuery = 'blues'
    restore(venues)
    expect(filters.value.searchQuery).toBe('blues')
  })

  it('URL filters win over saved filters', () => {
    localStorage.setItem('eventFilters', JSON.stringify({ searchQuery: 'a' }))
    currentQuery = { q: 'b' }
    const { filters, restore } = useEventFilters()
    restore(venues)
    expect(filters.value.searchQuery).toBe('b')
  })

  it('keeps venue slugs pending while venues are empty', () => {
    currentQuery = { venues: 'iron-horse' }
    const { pendingVenueSlugs, restore, resolvePendingVenues } = useEventFilters()
    restore([])
    resolvePendingVenues([])
    expect(pendingVenueSlugs.value).toEqual(['iron-horse'])
  })

  it('resolves known slugs and drops unknown ones once venues load', () => {
    currentQuery = { venues: 'iron-horse,nope' }
    const { filters, pendingVenueSlugs, restore, resolvePendingVenues } = useEventFilters()
    restore(undefined)
    resolvePendingVenues(venues)
    expect(pendingVenueSlugs.value).toEqual([])
    expect(filters.value.selectedVenueIds).toEqual(['v1'])
  })

  it('shares state between callers', () => {
    useEventFilters().filters.value.searchQuery = 'x'
    expect(useEventFilters().filters.value.searchQuery).toBe('x')
  })

  it('resetFilters defaults to all events in the current region', () => {
    const { filters, resetFilters } = useEventFilters()
    filters.value.selectedEventTypes = ['ALL_MUSIC']
    filters.value.selectedGenres = ['jazz']
    resetFilters('pioneer-valley')
    expect(filters.value.selectedEventTypes).toEqual([])
    expect(filters.value.selectedGenres).toEqual([])
    expect(filters.value.selectedRegions).toEqual(['pioneer-valley'])
  })

  it('clearFiltersKeepSearch keeps search and location', () => {
    const { filters, clearFiltersKeepSearch } = useEventFilters()
    Object.assign(filters.value, { searchQuery: 'jazz', selectedRegions: ['pioneer-valley'], selectedGenres: ['rock'], datePreset: 'week' })
    clearFiltersKeepSearch()
    expect(filters.value).toMatchObject({ searchQuery: 'jazz', selectedRegions: ['pioneer-valley'], selectedGenres: [], datePreset: 'all' })
  })

  it('persists to storage and keeps unrelated query params', () => {
    window.history.replaceState({}, '', '/?utm_source=mail')
    const { filters, persist } = useEventFilters()
    filters.value.selectedVenueIds = ['v1']
    persist(venues)
    expect(window.location.search).toBe('?utm_source=mail&venues=iron-horse')
    expect(JSON.parse(localStorage.getItem('eventFilters')!).selectedVenueIds).toEqual(['v1'])
  })
})
