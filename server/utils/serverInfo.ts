/**
 * Simple TypeScript utility for server information
 * This demonstrates TypeScript integration with a basic, easy-to-test example
 */

export interface ServerInfo {
  /** Server version from package.json */
  version: string
  /** Build number */
  buildNumber: number
  /** Server uptime in seconds */
  uptimeSeconds: number
  /** Formatted uptime string (human-readable) */
  uptimeFormatted: string
  /** Whether TypeScript is enabled */
  typescriptEnabled: boolean
  /** Node.js version */
  nodeVersion: string
  /** Platform (darwin, linux, win32) */
  platform: string
  /** Environment (development, production) */
  environment: string
}

/**
 * Get current server information
 * @returns Server information object
 */
export function getServerInfo(): ServerInfo {
  const packageJson = require('../../../package.json') // From dist/server/utils/ to root
  const uptimeSeconds = Math.floor(process.uptime())

  return {
    version: packageJson.version,
    buildNumber: packageJson.buildNumber || 0,
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    typescriptEnabled: true, // This file proves TypeScript is working!
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || 'development'
  }
}

/**
 * Format uptime in seconds to human-readable string
 * @param seconds Total seconds
 * @returns Formatted string like "2h 34m 12s"
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts: string[] = []

  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}

/**
 * Example of a more complex type - Audiobook duration formatting
 * This shows TypeScript's type system benefits
 */
export interface Duration {
  hours: number
  minutes: number
  seconds: number
}

/**
 * Parse duration in seconds to structured object
 * @param totalSeconds Total duration in seconds
 * @returns Duration object with hours, minutes, seconds
 */
export function parseDuration(totalSeconds: number): Duration {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return { hours, minutes, seconds }
}

/**
 * Format duration to readable string (e.g., "12h 34m 56s")
 * @param totalSeconds Total duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(totalSeconds: number): string {
  const { hours, minutes, seconds } = parseDuration(totalSeconds)

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

export default {
  getServerInfo,
  formatUptime,
  parseDuration,
  formatDuration
}
