const STATE_NAMES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co',
  connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
  illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la',
  maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn',
  mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or',
  pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd',
  tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa',
  'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
  quebec: 'qc', ontario: 'on',
  mass: 'ma',
}

const COMMON_ABBREVIATIONS: Record<string, string> = {
  mass: 'ma',
  conn: 'ct',
  dc: 'dc',
  ny: 'ny',
  vt: 'vt',
}

function squash(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null
  // Strip periods first
  let s = state.replace(/\./g, '')
  s = squash(s)
  if (/^[a-z]{2}$/.test(s)) {
    // Validate against STATE_NAMES values
    const validCodes = new Set(Object.values(STATE_NAMES))
    return validCodes.has(s) ? s : null
  }
  // Check common abbreviations
  if (COMMON_ABBREVIATIONS[s]) return COMMON_ABBREVIATIONS[s]
  return STATE_NAMES[s] ?? null
}

export function normalizeTownKey(city: string | null | undefined, state: string | null | undefined): string | null {
  const st = normalizeStateCode(state)
  if (!city || !st) return null
  let c = squash(city)

  // Strip trailing ZIP codes (5-digit or ZIP+4) and trailing periods
  c = c.replace(/\s+\d{5}(-\d{4})?$/, '')
  c = c.replace(/\.+$/, '')
  c = c.trim()

  const stateName = Object.keys(STATE_NAMES).find(n => STATE_NAMES[n] === st)

  // Try state code suffix: comma with optional space, or whitespace, with word boundary
  const codePattern = new RegExp(`(?:,|\\s)\\s*\\b${st}\\b$`)
  if (codePattern.test(c)) {
    c = c.replace(codePattern, '')
    c = c.replace(/,$/, '').trim()
    return c ? `${c}|${st}` : null
  }

  // Try state name suffix: only if preceded by comma
  if (stateName) {
    const namePattern = new RegExp(`,\\s*\\b${stateName.replace(/\s/g, '\\s+')}\\b$`)
    if (namePattern.test(c)) {
      c = c.replace(namePattern, '')
      c = c.replace(/,$/, '').trim()
      return c ? `${c}|${st}` : null
    }
  }

  // Add 'mass' as a special case suffix for Massachusetts
  if (st === 'ma') {
    const massPattern = /,\s*\bmass\b$/
    if (massPattern.test(c)) {
      c = c.replace(massPattern, '')
      c = c.replace(/,$/, '').trim()
      return c ? `${c}|${st}` : null
    }
  }

  return c ? `${c}|${st}` : null
}

export function cleanRegionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/^in\s+/i, '')
}

export function normalizeRegionName(name: string): string {
  return cleanRegionName(name).toLowerCase().replace(/^the\s+/, '')
}
