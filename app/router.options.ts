import type { RouterConfig } from '@nuxt/schema'

// Save scroll position per path
function saveScrollPosition(path: string, position: number) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(`scroll:${path}`, position.toString())
  }
}

function getScrollPosition(path: string): number | null {
  if (typeof sessionStorage !== 'undefined') {
    const saved = sessionStorage.getItem(`scroll:${path}`)
    return saved ? parseInt(saved, 10) : null
  }
  return null
}

function clearScrollPosition(path: string) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`scroll:${path}`)
  }
}

// Check if a path is a list page where we want to preserve scroll
function isListPage(path: string): boolean {
  // Home (events list), venues list, or venue detail page (has event list)
  return path === '/' || path === '/venues' || path.startsWith('/venues/')
}

// Check if navigating to a detail page (event pages)
function isEventDetailPage(path: string): boolean {
  return path.startsWith('/events/')
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    // If navigating away from a list page to an event detail page, save scroll position
    if (isListPage(from.path) && isEventDetailPage(to.path)) {
      saveScrollPosition(from.path, window.scrollY)
    }

    // If browser has saved position (back/forward navigation), use it
    // But prefer our saved position for list pages
    if (isListPage(to.path)) {
      const scrollY = getScrollPosition(to.path)
      if (scrollY) {
        clearScrollPosition(to.path)
        // Wait for content to render before scrolling
        return new Promise((resolve) => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              resolve({ top: scrollY, behavior: 'instant' })
            }, 300)
          })
        })
      }
    }

    // For other back/forward navigation, use browser's saved position
    if (savedPosition) {
      return savedPosition
    }

    // For hash links, scroll to element
    if (to.hash) {
      return new Promise((resolve) => {
        setTimeout(() => {
          const el = document.querySelector(to.hash)
          if (el) {
            resolve({ el: to.hash, behavior: 'smooth' })
          } else {
            resolve({ top: 0, behavior: 'instant' })
          }
        }, 100)
      })
    }

    // Default: scroll to top
    return { top: 0, behavior: 'instant' }
  },
}
