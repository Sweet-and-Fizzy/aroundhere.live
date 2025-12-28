/**
 * Composable for managing localStorage with reactive refs, TTL support, and JSON serialization.
 * Reduces duplication across 10+ components that use localStorage.
 */

import { readonly, type Ref } from 'vue'

export interface LocalStorageOptions<T> {
  /** Default value if nothing is stored */
  defaultValue: T
  /** Time-to-live in milliseconds (optional) */
  ttl?: number
  /** Custom serializer (defaults to JSON) */
  serialize?: (value: T) => string
  /** Custom deserializer (defaults to JSON.parse) */
  deserialize?: (value: string) => T
  /** Migration function to handle old data formats */
  migrate?: (data: unknown) => T
}

interface StoredData<T> {
  value: T
  savedAt: string
}

/**
 * Create a reactive ref that automatically persists to localStorage
 */
export function useLocalStorage<T>(
  key: string,
  options: LocalStorageOptions<T>
) {
  const {
    defaultValue,
    ttl,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    migrate,
  } = options

  // Internal state
  const data = ref<T>(defaultValue) as Ref<T>
  const isLoaded = ref(false)

  // Load from localStorage
  function load(): T {
    if (!import.meta.client) {
      return defaultValue
    }

    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        return defaultValue
      }

      const parsed = deserialize(raw)

      // Handle TTL if enabled
      if (ttl !== undefined) {
        const stored = parsed as StoredData<T>
        if (stored.savedAt) {
          const savedAt = new Date(stored.savedAt).getTime()
          const age = Date.now() - savedAt
          if (age > ttl) {
            // Expired, remove and return default
            localStorage.removeItem(key)
            return defaultValue
          }
          // Apply migration if provided
          return migrate ? migrate(stored.value) : stored.value
        }
      }

      // Apply migration if provided
      return migrate ? migrate(parsed) : parsed
    } catch {
      // Invalid data, remove it
      localStorage.removeItem(key)
      return defaultValue
    }
  }

  // Save to localStorage
  function save(value: T): void {
    if (!import.meta.client) return

    try {
      if (ttl !== undefined) {
        // Store with timestamp for TTL
        const stored: StoredData<T> = {
          value,
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(key, serialize(stored as unknown as T))
      } else {
        localStorage.setItem(key, serialize(value))
      }
    } catch (e) {
      console.warn(`Failed to save to localStorage key "${key}":`, e)
    }
  }

  // Remove from localStorage
  function remove(): void {
    if (!import.meta.client) return
    localStorage.removeItem(key)
    data.value = defaultValue
  }

  // Initialize on mount (client-side only)
  onMounted(() => {
    data.value = load()
    isLoaded.value = true
  })

  // Auto-save when data changes (after initial load)
  watch(
    data,
    (newValue) => {
      if (isLoaded.value) {
        save(newValue)
      }
    },
    { deep: true }
  )

  return {
    /** Reactive ref that auto-persists to localStorage */
    data,
    /** Whether initial load from localStorage is complete */
    isLoaded: readonly(isLoaded),
    /** Manually save current value */
    save: () => save(data.value),
    /** Remove from localStorage and reset to default */
    remove,
    /** Manually reload from localStorage */
    reload: () => {
      data.value = load()
    },
  }
}

/**
 * Simple get/set utilities for non-reactive localStorage access
 */
export function getLocalStorage<T>(key: string, defaultValue: T): T {
  if (!import.meta.client) return defaultValue

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

export function setLocalStorage<T>(key: string, value: T): void {
  if (!import.meta.client) return

  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn(`Failed to save to localStorage key "${key}":`, e)
  }
}

export function removeLocalStorage(key: string): void {
  if (!import.meta.client) return
  localStorage.removeItem(key)
}

/**
 * Get with TTL support
 */
export function getLocalStorageWithTTL<T>(
  key: string,
  defaultValue: T,
  ttl: number
): T {
  if (!import.meta.client) return defaultValue

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue

    const stored = JSON.parse(raw) as StoredData<T>
    if (!stored.savedAt) return defaultValue

    const savedAt = new Date(stored.savedAt).getTime()
    const age = Date.now() - savedAt

    if (age > ttl) {
      localStorage.removeItem(key)
      return defaultValue
    }

    return stored.value
  } catch {
    localStorage.removeItem(key)
    return defaultValue
  }
}

export function setLocalStorageWithTTL<T>(key: string, value: T): void {
  if (!import.meta.client) return

  try {
    const stored: StoredData<T> = {
      value,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(key, JSON.stringify(stored))
  } catch (e) {
    console.warn(`Failed to save to localStorage key "${key}":`, e)
  }
}
