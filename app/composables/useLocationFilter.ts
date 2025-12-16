import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'

export interface Venue {
  id: string
  name: string
  slug?: string
  city?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface Facets {
  venueCounts?: Record<string, number>
  cityCounts?: Record<string, number>
  cityRegions?: Record<string, string>
}

export interface CityVenues {
  city: string
  venues: Venue[]
  totalEvents: number
}

export interface RegionGroup {
  region: string
  cities: CityVenues[]
  totalEvents: number
}

export function useLocationFilter(
  venues: Ref<Venue[] | undefined>,
  facets: Ref<Facets | undefined>,
  selectedRegions: Ref<string[]>,
  selectedCities: Ref<string[]>,
  selectedVenueIds: Ref<string[]>
) {
  const { regionName: currentRegionName } = useCurrentRegion()

  // Track expanded state for hierarchical display
  const expandedRegions = ref<Set<string>>(new Set())
  const expandedCities = ref<Set<string>>(new Set())

  // Helper to get venues that have events
  const filteredVenues = computed(() => {
    const venueCounts = facets.value?.venueCounts ?? {}
    return (venues.value || []).filter(v => {
      const count = venueCounts[v.id] || 0
      return count > 0
    })
  })

  // Get selected venue objects
  const selectedVenueObjects = computed(() => {
    return filteredVenues.value.filter(v => selectedVenueIds.value.includes(v.id))
  })

  // Group venues by region → city → venues for hierarchical display
  const venuesByRegion = computed((): RegionGroup[] => {
    const cityRegions = facets.value?.cityRegions ?? {}
    const venueCounts = facets.value?.venueCounts ?? {}

    // Group venues by city
    const citiesMap = new Map<string, Venue[]>()
    filteredVenues.value.forEach(venue => {
      if (!venue.city) return
      if (!citiesMap.has(venue.city)) {
        citiesMap.set(venue.city, [])
      }
      citiesMap.get(venue.city)!.push(venue)
    })

    // Group cities by region
    const regionsMap = new Map<string, CityVenues[]>()
    citiesMap.forEach((cityVenues, city) => {
      const region = cityRegions[city] || 'Other'
      if (!regionsMap.has(region)) {
        regionsMap.set(region, [])
      }

      const totalEvents = cityVenues.reduce((sum, v) => sum + (venueCounts[v.id] || 0), 0)
      regionsMap.get(region)!.push({
        city,
        venues: cityVenues.sort((a, b) => a.name.localeCompare(b.name)),
        totalEvents
      })
    })

    // Convert to array and calculate region totals
    const regions: RegionGroup[] = []
    regionsMap.forEach((cities, region) => {
      const totalEvents = cities.reduce((sum, c) => sum + c.totalEvents, 0)
      regions.push({
        region,
        cities: cities.sort((a, b) => a.city.localeCompare(b.city)),
        totalEvents
      })
    })

    // Sort: current region first, then by event count
    const currentRegion = currentRegionName.value?.toLowerCase() || ''
    return regions.sort((a, b) => {
      // Check if either is the current region
      const aIsCurrent = currentRegion && currentRegion !== 'the area' && (
        a.region.toLowerCase().includes(currentRegion) ||
        currentRegion.includes(a.region.toLowerCase())
      )
      const bIsCurrent = currentRegion && currentRegion !== 'the area' && (
        b.region.toLowerCase().includes(currentRegion) ||
        currentRegion.includes(b.region.toLowerCase())
      )

      if (aIsCurrent && !bIsCurrent) return -1
      if (!aIsCurrent && bIsCurrent) return 1

      // Otherwise sort by event count descending
      return b.totalEvents - a.totalEvents
    })
  })

  // Flatten to city level (for single-region display)
  const venuesByCity = computed((): CityVenues[] => {
    if (venuesByRegion.value.length === 1) {
      return venuesByRegion.value[0].cities
    }
    return venuesByRegion.value.flatMap(r => r.cities)
  })

  // Auto-expand the current region (only if no regions are filtered)
  watch([venuesByRegion, currentRegionName, selectedRegions], ([regions, regionName, selected]) => {
    // Only auto-expand if user hasn't selected specific regions
    if (regions.length > 1 && regionName && regionName !== 'the area' && selected.length === 0) {
      const matchingRegion = regions.find(r =>
        r.region.toLowerCase().includes(regionName.toLowerCase()) ||
        regionName.toLowerCase().includes(r.region.toLowerCase())
      )
      if (matchingRegion) {
        expandedRegions.value.add(matchingRegion.region)
      }
    }
  }, { immediate: true })

  // Check if a city is selected (either directly or has individual venues selected)
  function isCityFullySelected(city: string): boolean {
    // City is fully selected if it's in the selectedCities array
    if (selectedCities.value.includes(city)) return true

    // Or if all its venues are individually selected
    const cityVenues = venuesByCity.value.find(c => c.city === city)?.venues ?? []
    return cityVenues.length > 0 && cityVenues.every(v => selectedVenueIds.value.includes(v.id))
  }

  // Check if some (but not all) venues in a city are selected
  function isCityPartiallySelected(city: string): boolean {
    // If city is directly selected, it's not partial
    if (selectedCities.value.includes(city)) return false

    // Check if some (but not all) venues are selected
    const cityVenues = venuesByCity.value.find(c => c.city === city)?.venues ?? []
    const selectedCount = cityVenues.filter(v => selectedVenueIds.value.includes(v.id)).length
    return selectedCount > 0 && selectedCount < cityVenues.length
  }

  // Toggle city selection (select city itself, not individual venues)
  function toggleCitySelection(city: string) {
    const isCityDirectlySelected = selectedCities.value.includes(city)
    const cityVenues = venuesByCity.value.find(c => c.city === city)?.venues ?? []
    const cityVenueIds = cityVenues.map(v => v.id)
    const allVenuesSelected = cityVenues.length > 0 &&
      cityVenues.every(v => selectedVenueIds.value.includes(v.id))

    if (isCityDirectlySelected) {
      // City is directly selected - deselect it
      selectedCities.value = selectedCities.value.filter(c => c !== city)
    } else if (allVenuesSelected) {
      // All individual venues are selected - consolidate into city selection
      selectedCities.value = [...selectedCities.value, city]
      selectedVenueIds.value = selectedVenueIds.value.filter(id => !cityVenueIds.includes(id))
    } else {
      // City not selected - select it and remove any individual venue selections
      selectedCities.value = [...selectedCities.value, city]
      selectedVenueIds.value = selectedVenueIds.value.filter(id => !cityVenueIds.includes(id))
    }
  }

  // Check if a region is selected (either directly or has cities/venues selected)
  function isRegionFullySelected(region: string): boolean {
    // Region is fully selected if it's in the selectedRegions array
    if (selectedRegions.value.includes(region)) return true

    // Or if all its cities and venues are selected
    const regionData = venuesByRegion.value.find(r => r.region === region)
    if (!regionData) return false

    const allCitiesSelected = regionData.cities.every(c => selectedCities.value.includes(c.city))
    if (allCitiesSelected && regionData.cities.length > 0) return true

    const allVenues = regionData.cities.flatMap(c => c.venues)
    return allVenues.length > 0 && allVenues.every(v => selectedVenueIds.value.includes(v.id))
  }

  // Check if some (but not all) items in a region are selected
  function isRegionPartiallySelected(region: string): boolean {
    // If region is directly selected, it's not partial
    if (selectedRegions.value.includes(region)) return false

    const regionData = venuesByRegion.value.find(r => r.region === region)
    if (!regionData) return false

    // Check if any cities or venues are selected
    const hasCitySelected = regionData.cities.some(c => selectedCities.value.includes(c.city))
    const allVenues = regionData.cities.flatMap(c => c.venues)
    const hasVenueSelected = allVenues.some(v => selectedVenueIds.value.includes(v.id))

    return hasCitySelected || hasVenueSelected
  }

  // Toggle region selection (select region itself, not individual cities/venues)
  function toggleRegionSelection(region: string) {
    const isSelected = selectedRegions.value.includes(region)

    if (isSelected) {
      // Deselect the region
      selectedRegions.value = selectedRegions.value.filter(r => r !== region)
    } else {
      // Select the region and remove individual city/venue selections from this region
      selectedRegions.value = [...selectedRegions.value, region]

      const regionData = venuesByRegion.value.find(r => r.region === region)
      if (!regionData) return

      // Remove any individual city selections from this region
      const regionCities = regionData.cities.map(c => c.city)
      selectedCities.value = selectedCities.value.filter(c => !regionCities.includes(c))

      // Remove any individual venue selections from this region
      const regionVenues = regionData.cities.flatMap(c => c.venues)
      const regionVenueIds = regionVenues.map(v => v.id)
      selectedVenueIds.value = selectedVenueIds.value.filter(id => !regionVenueIds.includes(id))
    }
  }

  // Generate an intelligent summary label showing regions, cities, or venues
  const locationSummary = computed(() => {
    const regionCount = selectedRegions.value.length
    const cityCount = selectedCities.value.length
    const venueCount = selectedVenueIds.value.length
    const totalCount = regionCount + cityCount + venueCount

    if (totalCount === 0) return null

    // Priority: Show the highest level selections first (regions > cities > venues)
    if (regionCount > 0) {
      if (regionCount === 1 && cityCount === 0 && venueCount === 0) {
        return selectedRegions.value[0]
      }
      if (regionCount === 2 && cityCount === 0 && venueCount === 0) {
        return selectedRegions.value.join(' and ')
      }
      if (regionCount >= 1) {
        return `${selectedRegions.value[0]} and ${totalCount - 1} more`
      }
    }

    if (cityCount > 0) {
      if (cityCount === 1 && venueCount === 0) {
        return selectedCities.value[0]
      }
      if (cityCount === 2 && venueCount === 0) {
        return selectedCities.value.join(' and ')
      }
      if (cityCount >= 1) {
        return `${selectedCities.value[0]} and ${totalCount - 1} more`
      }
    }

    // Fall back to showing venue names
    const venueNames = selectedVenueObjects.value.map(v => v.name)
    if (venueNames.length === 1) return venueNames[0]
    if (venueNames.length === 2) return venueNames.join(' and ')
    return `${venueNames[0]} and ${venueNames.length - 1} more`
  })

  return {
    // Computed
    venuesByRegion,
    venuesByCity,
    filteredVenues,
    selectedVenueObjects,
    locationSummary,

    // State
    expandedRegions,
    expandedCities,

    // Methods
    isCityFullySelected,
    isCityPartiallySelected,
    toggleCitySelection,
    isRegionFullySelected,
    isRegionPartiallySelected,
    toggleRegionSelection,
  }
}
