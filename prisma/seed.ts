import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create genres
  const genres = await Promise.all([
    prisma.genre.upsert({
      where: { slug: 'rock' },
      update: {},
      create: { name: 'Rock', slug: 'rock', sortOrder: 1 },
    }),
    prisma.genre.upsert({
      where: { slug: 'punk' },
      update: {},
      create: { name: 'Punk', slug: 'punk', sortOrder: 2 },
    }),
    prisma.genre.upsert({
      where: { slug: 'indie' },
      update: {},
      create: { name: 'Indie', slug: 'indie', sortOrder: 3 },
    }),
    prisma.genre.upsert({
      where: { slug: 'folk' },
      update: {},
      create: { name: 'Folk', slug: 'folk', sortOrder: 4 },
    }),
    prisma.genre.upsert({
      where: { slug: 'jazz' },
      update: {},
      create: { name: 'Jazz', slug: 'jazz', sortOrder: 5 },
    }),
    prisma.genre.upsert({
      where: { slug: 'electronic' },
      update: {},
      create: { name: 'Electronic', slug: 'electronic', sortOrder: 6 },
    }),
    prisma.genre.upsert({
      where: { slug: 'hip-hop' },
      update: {},
      create: { name: 'Hip-Hop', slug: 'hip-hop', sortOrder: 7 },
    }),
    prisma.genre.upsert({
      where: { slug: 'metal' },
      update: {},
      create: { name: 'Metal', slug: 'metal', sortOrder: 8 },
    }),
    prisma.genre.upsert({
      where: { slug: 'blues' },
      update: {},
      create: { name: 'Blues', slug: 'blues', sortOrder: 9 },
    }),
    prisma.genre.upsert({
      where: { slug: 'country' },
      update: {},
      create: { name: 'Country', slug: 'country', sortOrder: 10 },
    }),
    prisma.genre.upsert({
      where: { slug: 'singer-songwriter' },
      update: {},
      create: { name: 'Singer-Songwriter', slug: 'singer-songwriter', sortOrder: 11 },
    }),
    prisma.genre.upsert({
      where: { slug: 'americana' },
      update: {},
      create: { name: 'Americana', slug: 'americana', sortOrder: 12 },
    }),
    prisma.genre.upsert({
      where: { slug: 'world' },
      update: {},
      create: { name: 'World', slug: 'world', sortOrder: 13 },
    }),
    prisma.genre.upsert({
      where: { slug: 'classical' },
      update: {},
      create: { name: 'Classical', slug: 'classical', sortOrder: 14 },
    }),
    prisma.genre.upsert({
      where: { slug: 'funk' },
      update: {},
      create: { name: 'Funk', slug: 'funk', sortOrder: 15 },
    }),
  ])
  console.log(`Created ${genres.length} genres`)

  // Create region
  const region = await prisma.region.upsert({
    where: { slug: 'western-ma' },
    update: {},
    create: {
      name: 'Western Massachusetts',
      slug: 'western-ma',
      timezone: 'America/New_York',
      defaultRadius: 30,
    },
  })
  console.log(`Created region: ${region.name}`)

  // Create real venues from the planning doc
  const venues = [
    {
      name: 'Iron Horse Music Hall',
      slug: 'iron-horse-music-hall',
      address: '18 Center St',
      city: 'Northampton',
      state: 'MA',
      postalCode: '01060',
      latitude: 42.3193,
      longitude: -72.6295,
      capacity: 200,
      venueType: 'CLUB' as const,
      website: 'https://ironhorse.org',
      logoUrl: 'https://images.squarespace-cdn.com/content/v1/6512f0876c2c335a35c49486/8e52182f-ae87-4339-94ad-fd884ee2f889/IH+logo+horseshoe+1+with+adress.png',
      verified: true,
    },
    {
      name: 'The Parlor Room',
      slug: 'the-parlor-room',
      address: '32 Masonic St',
      city: 'Northampton',
      state: 'MA',
      postalCode: '01060',
      latitude: 42.3181,
      longitude: -72.6283,
      capacity: 100,
      venueType: 'CLUB' as const,
      website: 'https://parlorroom.org',
      logoUrl: 'https://images.squarespace-cdn.com/content/v1/633d903a1fba2945e5b70481/4f757485-a438-454c-a1ce-4fd0d477f54d/PRCO-logo-header-web.png',
      verified: true,
    },
    {
      name: 'The Drake',
      slug: 'the-drake',
      address: '44 N Pleasant St',
      city: 'Amherst',
      state: 'MA',
      postalCode: '01002',
      latitude: 42.3751,
      longitude: -72.5198,
      capacity: 150,
      venueType: 'BAR' as const,
      website: 'https://www.thedrakeamherst.org',
      logoUrl: 'https://images.squarespace-cdn.com/content/v1/618bdc7a1c0a717b716735c4/bf9cd29b-ef91-4574-b2e3-ff5f2abc83f8/Drake_Primary+Logo_White.png',
      verified: true,
    },
    {
      name: 'Marigold Theater',
      slug: 'marigold-theater',
      address: '84 Cottage St',
      city: 'Easthampton',
      state: 'MA',
      postalCode: '01027',
      latitude: 42.2657,
      longitude: -72.6695,
      capacity: 250,
      venueType: 'THEATER' as const,
      website: 'https://marigold.org',
      logoUrl: 'https://marigold.org/wp-content/uploads/2025/10/Open-Sans-1.png',
      verified: true,
    },
    {
      name: 'De La Luz',
      slug: 'de-la-luz',
      address: '114 Race St',
      city: 'Holyoke',
      state: 'MA',
      postalCode: '01040',
      latitude: 42.2063,
      longitude: -72.6099,
      capacity: 200,
      venueType: 'CONCERT_HALL' as const,
      website: 'https://delaluz.org',
      logoUrl: 'https://delaluz.org/wp-content/uploads/2025/02/DLL-Menu-Logo.png',
      verified: true,
    },
    {
      name: 'Progression Brewing Company',
      slug: 'progression-brewing',
      address: '9 Pearl St',
      city: 'Northampton',
      state: 'MA',
      postalCode: '01060',
      latitude: 42.3176,
      longitude: -72.6299,
      capacity: 75,
      venueType: 'BAR' as const,
      website: 'https://progressionbrewing.com',
      logoUrl: 'https://progressionbrewing.com/wp-content/uploads/2021/11/Progression-Logo-Text-2020-White-1.png',
      verified: true,
    },
    {
      name: 'New City Brewery',
      slug: 'new-city-brewery',
      address: '180 Pleasant St',
      city: 'Easthampton',
      state: 'MA',
      postalCode: '01027',
      latitude: 42.2626,
      longitude: -72.6709,
      capacity: 100,
      venueType: 'BAR' as const,
      website: 'https://www.newcitybrewery.com',
      logoUrl: 'https://images.squarespace-cdn.com/content/v1/5ecec61d7a2ca26994cb558d/1590611204086-QB0DM33J9GH9J2253ORR/NCB-Text-Logo.png',
      verified: true,
    },
    {
      name: 'Haze',
      slug: 'haze',
      address: '24 Main St',
      city: 'Northampton',
      state: 'MA',
      postalCode: '01060',
      latitude: 42.3199039,
      longitude: -72.6288516,
      capacity: 100,
      venueType: 'BAR' as const,
      website: 'https://hazenorthampton.org',
      logoUrl: 'https://hazenorthampton.org/uploads/banners/banner_689282a6ed7f41.94618065.png',
      verified: true,
    },
    {
      name: 'Stone Church',
      slug: 'stone-church',
      address: '210 Main St',
      city: 'Brattleboro',
      state: 'VT',
      postalCode: '05301',
      latitude: 42.8549,
      longitude: -72.5595,
      capacity: 200,
      venueType: 'CLUB' as const,
      website: 'https://stonechurchvt.com',
      logoUrl: 'https://images.squarespace-cdn.com/content/v1/679133616a34cb4c51d74cb3/3613b3ef-4b70-436a-9182-6752c6839f1c/sc_logo_2.18.white.png',
      verified: true,
    },
    {
      name: 'Marigold Brattleboro',
      slug: 'marigold-brattleboro',
      address: '26 Elliot St',
      city: 'Brattleboro',
      state: 'VT',
      postalCode: '05301',
      latitude: 42.8515,
      longitude: -72.5576,
      capacity: 75,
      venueType: 'BAR' as const,
      website: 'https://marigold.org',
      logoUrl: 'https://marigold.org/wp-content/uploads/2025/10/Open-Sans-1.png',
      verified: true,
    },
  ]

  for (const venueData of venues) {
    await prisma.venue.upsert({
      where: { regionId_slug: { regionId: region.id, slug: venueData.slug } },
      update: venueData,
      create: {
        ...venueData,
        regionId: region.id,
      },
    })
  }
  console.log(`Created/updated ${venues.length} venues`)

  // Create sources for venue scrapers (with priority)
  const sources = [
    {
      name: 'Iron Horse Scraper',
      slug: 'iron-horse',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10, // Venue sources have highest priority
      trustScore: 0.9,
      website: 'https://ironhorse.org',
    },
    {
      name: 'The Drake Scraper',
      slug: 'the-drake',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://www.thedrakeamherst.org',
    },
    {
      name: 'Parlor Room Scraper',
      slug: 'parlor-room',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://parlorroom.org',
    },
    {
      name: 'Marigold Scraper',
      slug: 'marigold',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://marigold.org',
    },
    {
      name: 'De La Luz Scraper',
      slug: 'de-la-luz',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://delaluz.org',
    },
    {
      name: 'New City Brewery Scraper',
      slug: 'new-city-brewery',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://newcitybrewery.com',
    },
    {
      name: 'Haze Scraper',
      slug: 'haze',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://hazenorthampton.org',
    },
    {
      name: 'Progression Brewing Scraper',
      slug: 'progression-brewing',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://progressionbrewing.com',
    },
    {
      name: 'Stone Church Scraper',
      slug: 'stone-church',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://stonechurchvt.com',
    },
    {
      name: 'Marigold Brattleboro Scraper',
      slug: 'marigold-brattleboro',
      type: 'SCRAPER' as const,
      category: 'VENUE' as const,
      priority: 10,
      trustScore: 0.9,
      website: 'https://marigold.org',
    },
    {
      name: 'Manual Entry',
      slug: 'manual-entry',
      type: 'MANUAL' as const,
      category: 'OTHER' as const,
      priority: 40, // Manual entry lower priority than venues
      trustScore: 1.0,
    },
    {
      name: 'Band Website',
      slug: 'band-website',
      type: 'SCRAPER' as const,
      category: 'ARTIST' as const,
      priority: 30, // Artist sites lower than venues
      trustScore: 0.7,
    },
  ]

  for (const sourceData of sources) {
    await prisma.source.upsert({
      where: { slug: sourceData.slug },
      update: sourceData,
      create: sourceData,
    })
  }
  console.log(`Created/updated ${sources.length} sources`)

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
