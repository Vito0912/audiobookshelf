/**
 * Advanced Library Statistics Calculator
 * TypeScript utility for calculating complex library statistics
 * Demonstrates TypeScript with real Audiobookshelf functionality
 */

/**
 * Represents a single library item (book or podcast)
 */
export interface LibraryItem {
  id: string
  mediaType: 'book' | 'podcast'
  media: {
    duration?: number // in seconds
    size?: number // in bytes
    tracks?: Array<{ duration: number }>
    numAudioFiles?: number
    numChapters?: number
    metadata?: {
      title?: string
      author?: string
      narrator?: string
      publishedYear?: string
      language?: string
    }
  }
  addedAt?: number
  updatedAt?: number
}

/**
 * Detailed library statistics
 */
export interface LibraryStatistics {
  // Basic counts
  totalItems: number
  totalBooks: number
  totalPodcasts: number

  // Duration statistics
  totalDuration: number
  totalDurationFormatted: string
  averageDuration: number
  averageDurationFormatted: string
  longestItem: {
    title: string
    duration: number
    durationFormatted: string
  } | null
  shortestItem: {
    title: string
    duration: number
    durationFormatted: string
  } | null

  // Size statistics
  totalSize: number
  totalSizeFormatted: string
  averageSize: number
  averageSizeFormatted: string

  // Audio statistics
  totalAudioFiles: number
  totalChapters: number
  averageChaptersPerBook: number

  // Time-based statistics
  itemsAddedLastWeek: number
  itemsAddedLastMonth: number
  oldestItemDate: string | null
  newestItemDate: string | null

  // Language distribution
  languages: Array<{ language: string; count: number }>

  // Narrator statistics (for audiobooks)
  topNarrators: Array<{ narrator: string; count: number }>

  // TypeScript validation status
  calculatedWith: 'TypeScript' | 'JavaScript'
  calculatedAt: string
}

/**
 * Calculate comprehensive library statistics
 * @param items Array of library items
 * @returns Detailed statistics object
 */
export function calculateLibraryStats(items: LibraryItem[]): LibraryStatistics {
  // Basic counts
  const totalItems = items.length
  const books = items.filter(item => item.mediaType === 'book')
  const podcasts = items.filter(item => item.mediaType === 'podcast')
  const totalBooks = books.length
  const totalPodcasts = podcasts.length

  // Duration calculations
  const durations = items
    .map(item => item.media.duration || 0)
    .filter(d => d > 0)
    .sort((a, b) => a - b)

  const totalDuration = durations.reduce((sum, d) => sum + d, 0)
  const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0

  // Find longest and shortest
  let longestItem = null
  let shortestItem = null

  if (durations.length > 0) {
    const itemsWithDuration = items.filter(item => (item.media.duration || 0) > 0)

    const longest = itemsWithDuration.reduce((max, item) =>
      (item.media.duration || 0) > (max.media.duration || 0) ? item : max
    )
    longestItem = {
      title: longest.media.metadata?.title || 'Unknown',
      duration: longest.media.duration || 0,
      durationFormatted: formatDuration(longest.media.duration || 0)
    }

    const shortest = itemsWithDuration.reduce((min, item) =>
      (item.media.duration || 0) < (min.media.duration || 0) ? item : min
    )
    shortestItem = {
      title: shortest.media.metadata?.title || 'Unknown',
      duration: shortest.media.duration || 0,
      durationFormatted: formatDuration(shortest.media.duration || 0)
    }
  }

  // Size calculations
  const sizes = items.map(item => item.media.size || 0).filter(s => s > 0)
  const totalSize = sizes.reduce((sum, s) => sum + s, 0)
  const averageSize = sizes.length > 0 ? totalSize / sizes.length : 0

  // Audio file statistics
  const totalAudioFiles = items.reduce((sum, item) =>
    sum + (item.media.numAudioFiles || 0), 0
  )
  const totalChapters = items.reduce((sum, item) =>
    sum + (item.media.numChapters || 0), 0
  )
  const booksWithChapters = books.filter(b => (b.media.numChapters || 0) > 0)
  const averageChaptersPerBook = booksWithChapters.length > 0
    ? totalChapters / booksWithChapters.length
    : 0

  // Time-based statistics
  const now = Date.now()
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000)
  const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000)

  const itemsAddedLastWeek = items.filter(item =>
    (item.addedAt || 0) > oneWeekAgo
  ).length
  const itemsAddedLastMonth = items.filter(item =>
    (item.addedAt || 0) > oneMonthAgo
  ).length

  // Find oldest and newest
  const sortedByDate = [...items]
    .filter(item => item.addedAt)
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))

  const oldestItemDate = sortedByDate.length > 0
    ? new Date(sortedByDate[0].addedAt || 0).toLocaleDateString()
    : null
  const newestItemDate = sortedByDate.length > 0
    ? new Date(sortedByDate[sortedByDate.length - 1].addedAt || 0).toLocaleDateString()
    : null

  // Language distribution
  const languageMap = new Map<string, number>()
  items.forEach(item => {
    const lang = item.media.metadata?.language || 'Unknown'
    languageMap.set(lang, (languageMap.get(lang) || 0) + 1)
  })
  const languages = Array.from(languageMap.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Narrator statistics
  const narratorMap = new Map<string, number>()
  books.forEach(item => {
    const narrator = item.media.metadata?.narrator
    if (narrator) {
      narratorMap.set(narrator, (narratorMap.get(narrator) || 0) + 1)
    }
  })
  const topNarrators = Array.from(narratorMap.entries())
    .map(([narrator, count]) => ({ narrator, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    totalItems,
    totalBooks,
    totalPodcasts,
    totalDuration,
    totalDurationFormatted: formatDuration(totalDuration),
    averageDuration,
    averageDurationFormatted: formatDuration(averageDuration),
    longestItem,
    shortestItem,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    averageSize,
    averageSizeFormatted: formatBytes(averageSize),
    totalAudioFiles,
    totalChapters,
    averageChaptersPerBook: Math.round(averageChaptersPerBook * 10) / 10,
    itemsAddedLastWeek,
    itemsAddedLastMonth,
    oldestItemDate,
    newestItemDate,
    languages,
    topNarrators,
    calculatedWith: 'TypeScript',
    calculatedAt: new Date().toISOString()
  }
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds Total seconds
 * @returns Formatted string like "12h 34m" or "45m 12s"
 */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts: string[] = []

  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 && hours === 0) parts.push(`${secs}s`) // Only show seconds if no hours

  return parts.join(' ') || '0s'
}

/**
 * Format bytes to human-readable size
 * @param bytes Number of bytes
 * @returns Formatted string like "1.5 GB" or "234.5 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}

/**
 * Calculate reading/listening speed statistics
 * @param totalDuration Total duration in seconds
 * @param daysInLibrary Number of days the library has existed
 * @returns Statistics about consumption rate
 */
export function calculateConsumptionStats(
  totalDuration: number,
  daysInLibrary: number
): {
  hoursPerDay: number
  hoursPerWeek: number
  hoursPerMonth: number
  daysOfContent: number
} {
  const totalHours = totalDuration / 3600
  const hoursPerDay = daysInLibrary > 0 ? totalHours / daysInLibrary : 0

  return {
    hoursPerDay: Math.round(hoursPerDay * 100) / 100,
    hoursPerWeek: Math.round(hoursPerDay * 7 * 100) / 100,
    hoursPerMonth: Math.round(hoursPerDay * 30 * 100) / 100,
    daysOfContent: Math.round((totalDuration / (24 * 3600)) * 100) / 100
  }
}

export default {
  calculateLibraryStats,
  formatDuration,
  formatBytes,
  calculateConsumptionStats
}
