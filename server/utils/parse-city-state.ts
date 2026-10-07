const COUNTRY = /^(usa|us|u\.s\.a\.?|united states( of america)?)$/i

/** Best-effort city/state from a comma-separated address such as Google's formattedAddress. */
export function parseCityState(address: string): { city: string | null; state: string | null } {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length && COUNTRY.test(parts[parts.length - 1]!)) parts.pop()
  if (parts.length < 2) return { city: null, state: null }
  const state = parts[parts.length - 1]!.replace(/\s+\d{5}(-\d{4})?$/, '').trim()
  const city = parts[parts.length - 2]!
  return { city: city || null, state: state || null }
}
