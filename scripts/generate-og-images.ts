import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function generateOGImages() {
  console.log('Generating OG images...\n')

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2, // Higher quality
  })

  try {
    // Generate main OG image
    const htmlPath = join(__dirname, 'generate-og-image.html')
    await page.goto(`file://${htmlPath}`)
    await page.waitForTimeout(500) // Let it render

    const outputPath = join(__dirname, '..', 'public', 'og-image.png')
    await page.screenshot({
      path: outputPath,
      type: 'png',
    })
    console.log('✅ Created og-image.png')

    // For now, copy the same image for venues and playlist
    // You can customize these later
    const venuesPath = join(__dirname, '..', 'public', 'og-image-venues.png')
    const playlistPath = join(__dirname, '..', 'public', 'og-image-playlist.png')

    await page.screenshot({ path: venuesPath, type: 'png' })
    console.log('✅ Created og-image-venues.png')

    await page.screenshot({ path: playlistPath, type: 'png' })
    console.log('✅ Created og-image-playlist.png')

    console.log('\n🎉 All OG images generated successfully!')
    console.log('\nYou can customize the venue and playlist images later by editing:')
    console.log('  - scripts/generate-og-image.html')
    console.log('  - scripts/generate-og-images.ts')

  } catch (error) {
    console.error('Error generating images:', error)
  } finally {
    await browser.close()
  }
}

generateOGImages()
