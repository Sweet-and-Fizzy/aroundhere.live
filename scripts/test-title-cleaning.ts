/**
 * Test the title cleaning function
 */

import { cleanEventTitle } from '../server/utils/html'

const testCases = [
  'Saturday December 20th - Event Name',
  'Friday, January 3rd - Another Event',
  'Monday January 15th - Live Music',
  'Open Mic 7-10 (Sign-Up @ 6)',
  'Karaoke, 8:30-11pm',
  'Rodrigo Alonzo, 7-8',
  'Pamela Means 3rd Thursday Residency, 7-8:30',
  'Event Name',  // Already clean
  'Jazz Night (Doors @ 7pm)',
  'Sunday Brunch 11am-2pm',
  'Live music: The Beatles Tribute',
  'Live Music - Jazz Quartet',
  'Comedy: Stand Up Night',
  'Show - Magic Show',
  'Music: Rock Band',
]

console.log('Testing title cleaning:\n')
testCases.forEach(test => {
  const cleaned = cleanEventTitle(test)
  const changed = cleaned !== test ? '✓' : ' '
  console.log(`${changed} Input:  "${test}"`)
  console.log(`  Output: "${cleaned}"`)
  console.log()
})
