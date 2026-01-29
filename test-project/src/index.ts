/**
 * Main entry point for the test project
 */
import { UserService } from './services/userService'
import { ApiClient } from './api/client'
import type { User } from './types'

// Global constants
export const APP_NAME = 'Test App'
export const VERSION = '1.0.0'
const INTERNAL_SECRET = 'secret123'

// Global variable (let)
let requestCount = 0

// Main function
export function main(): void {
  console.log(`Starting ${APP_NAME} v${VERSION}`)

  const apiClient = new ApiClient('https://api.example.com')
  const userService = new UserService(apiClient)

  requestCount++
  console.log(`Request count: ${requestCount}`)
}

// Arrow function (exported)
export const getVersion = (): string => VERSION

// Arrow function (not exported)
const incrementRequestCount = (): number => ++requestCount

// Run main
main()
