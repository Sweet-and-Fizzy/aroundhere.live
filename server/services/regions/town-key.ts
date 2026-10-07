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
}

function squash(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null
  const s = squash(state)
  if (/^[a-z]{2}$/.test(s)) return s
  return STATE_NAMES[s] ?? null
}

export function normalizeTownKey(city: string | null | undefined, state: string | null | undefined): string | null {
  const st = normalizeStateCode(state)
  if (!city || !st) return null
  let c = squash(city)
  const stateName = Object.keys(STATE_NAMES).find(n => STATE_NAMES[n] === st)
  const suffixes = [st, ...(stateName ? [stateName] : [])]
  for (const suffix of suffixes) {
    const re = new RegExp(`,?\\s+${suffix.replace(/\s/g, '\\s+')}$`)
    if (re.test(c)) {
      c = c.replace(re, '')
      break
    }
  }
  c = c.replace(/,$/, '').trim()
  return c ? `${c}|${st}` : null
}

export function cleanRegionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/^in\s+/i, '')
}

export function normalizeRegionName(name: string): string {
  return cleanRegionName(name).toLowerCase().replace(/^the\s+/, '')
}
