import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  await page.goto('https://marigold.org/events', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.wonderplugin-gridgallery-item a'))
      .map(a => ({
        href: a.href,
        title: a.getAttribute('data-title'),
        text: a.textContent?.trim().slice(0, 50)
      }))
      .slice(0, 15)
  })
  
  console.log(JSON.stringify(links, null, 2))
  
  await browser.close()
}

main().catch(console.error)

