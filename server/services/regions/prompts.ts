import type { CandidateRegion, TownInput } from './types'

const MAX_MEMBER_TOWNS = 25

const GRANULARITY = `A region is the area a local would name when deciding where to go out for a show,
typically 15-30 miles across. Use the most common colloquial name people actually say.
Dense metros may be split (for example the North Shore vs Greater Boston); rural areas may be broader.
Neighborhoods of a city (for example Dorchester, Allston, Jamaica Plain in Boston) belong with that city.`

function describeRegion(r: CandidateRegion): string {
  return `- id "${r.id}": ${r.name} (${r.distanceMiles.toFixed(0)} mi away). Towns: ${r.towns.slice(0, MAX_MEMBER_TOWNS).join(', ') || '(none listed)'}`
}

export function buildAssignPrompt(town: TownInput, candidates: CandidateRegion[]): string {
  return `You assign towns to regions for a local live-music listings site.

${GRANULARITY}

Town: ${town.city}, ${town.state} (key ${town.townKey}, at ${town.lat.toFixed(3)}, ${town.lng.toFixed(3)})

Candidate regions:
${candidates.map(describeRegion).join('\n') || '(none)'}

If the town clearly belongs to one candidate region, answer with its id.
If it does not belong to any of them, answer null. Do not invent a new region.

Respond with only JSON, either {"regionId": "<id>"} or {"regionId": null}.`
}

export function buildPartitionPrompt(towns: TownInput[], nearby: CandidateRegion[], fixed: { townKey: string; regionId: string }[]): string {
  const fixedLines = fixed.map(f => `- ${f.townKey} is FIXED in region id "${f.regionId}"`).join('\n')
  return `You group towns into regions for a local live-music listings site.

${GRANULARITY}

Region names must read naturally after the word "in" on the site, e.g. "the Pioneer Valley",
"the North Shore", "Greater Boston", "Western Massachusetts". Do not start a name with "in".

Existing nearby regions (reuse one by giving its existingRegionId when a town belongs to it):
${nearby.map(describeRegion).join('\n') || '(none)'}

${fixedLines ? `Fixed assignments that must not change:\n${fixedLines}\n` : ''}
Towns to group (key, name, lat, lng):
${towns.map(t => `- ${t.townKey}: ${t.city}, ${t.state} (${t.lat.toFixed(3)}, ${t.lng.toFixed(3)})`).join('\n')}

Every town key above must appear in exactly one region.

Respond with only JSON:
{"regions": [{"name": "<region name>", "existingRegionId": "<id, only when reusing>", "towns": ["<town key>", ...]}]}`
}
