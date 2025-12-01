import type { RouterConfig } from '@nuxt/schema'

const SCROLL_KEY = 'eventListScrollPosition'

function saveScrollPosition(position: number) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SCROLL_KEY, position.toString())
  }
}

function getScrollPosition(): number | null {
  if (typeof sessionStorage !== 'undefined') {
    const saved = sessionStorage.getItem(SCROLL_KEY)
    return saved ? parseInt(saved, 10) : null
  }
  return null
}

function clearScrollPosition() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SCROLL_KEY)
  }
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    // If browser has saved position (back/forward navigation), use it
    if (savedPosition) {
      return savedPosition
    }

    // If navigating away from the home page, save scroll position
    if (from.path === '/' && to.path !== '/') {
      saveScrollPosition(window.scrollY)
    }

    // If navigating back to home page, restore scroll position
    if (to.path === '/') {
      const scrollY = getScrollPosition()
      if (scrollY) {
        clearScrollPosition()
        // Wait for content to render before scrolling
        return new Promise((resolve) => {
          // Use requestAnimationFrame + longer delay to ensure content is rendered
          requestAnimationFrame(() => {
            setTimeout(() => {
              resolve({ top: scrollY, behavior: 'instant' })
            }, 300)
          })
        })
      }
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
