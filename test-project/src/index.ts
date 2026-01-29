/**
 * Main entry point for the test project
 * This file demonstrates various function call patterns for call graph testing
 */
import { createUserService } from './services/userService'
import { createApiClient, getApiClient } from './api/client'
import {
  validateEmail,
  validatePassword,
  validateUser,
  sanitizeUserInput
} from './utils/validators'
import type { User, CreateUserDto } from './types'

// Global constants
export const APP_NAME = 'Test App'
export const VERSION = '1.0.0'
const INTERNAL_SECRET = 'secret123'

// Global variable (let)
let requestCount = 0

/**
 * Initialize the application
 */
export function initApp(): void {
  console.log(`Initializing ${APP_NAME} v${VERSION}`)
  requestCount = 0
  setupLogging()
}

/**
 * Setup logging configuration
 */
function setupLogging(): void {
  console.log('Logging configured')
  logAppInfo()
}

/**
 * Log application info
 */
function logAppInfo(): void {
  console.log(`App: ${APP_NAME}, Version: ${getVersion()}`)
}

/**
 * Main function - orchestrates the application flow
 */
export function main(): void {
  // Initialize
  initApp()

  // Create services
  const apiClient = getApiClient()
  const userService = createUserService(apiClient)

  // Process a test user
  processTestUser()

  // Increment counter
  incrementRequestCount()
  console.log(`Request count: ${requestCount}`)
}

/**
 * Process a test user registration
 */
export function processTestUser(): void {
  const testUserData: CreateUserDto = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'securePassword123'
  }

  // Validate the user data
  const isValid = validateUserData(testUserData)

  if (isValid) {
    console.log('User data is valid, proceeding with registration')
    registerUser(testUserData)
  } else {
    console.log('User data validation failed')
  }
}

/**
 * Validate user data using validators module
 */
export function validateUserData(data: CreateUserDto): boolean {
  // Sanitize inputs first
  const sanitizedName = sanitizeUserInput(data.name)
  const sanitizedEmail = sanitizeUserInput(data.email)

  // Then validate
  const emailValid = validateEmail(sanitizedEmail)
  const passwordValid = validatePassword(data.password)
  const userValid = validateUser({ ...data, name: sanitizedName, email: sanitizedEmail })

  return emailValid && passwordValid && userValid
}

/**
 * Register a new user
 */
function registerUser(data: CreateUserDto): void {
  console.log(`Registering user: ${data.name}`)
  notifyUserRegistration(data.email)
}

/**
 * Notify about user registration
 */
function notifyUserRegistration(email: string): void {
  console.log(`Notification sent to: ${email}`)
  logUserAction('registration', email)
}

/**
 * Log user actions
 */
export function logUserAction(action: string, userId: string): void {
  incrementRequestCount()
  console.log(`[${new Date().toISOString()}] User ${userId}: ${action}`)
}

// Arrow function (exported)
export const getVersion = (): string => VERSION

// Arrow function that calls another function
export const getAppInfo = (): string => {
  const version = getVersion()
  return `${APP_NAME} v${version}`
}

// Arrow function (not exported)
const incrementRequestCount = (): number => ++requestCount

// Utility function that chains calls
export function processUserBatch(users: CreateUserDto[]): number {
  let successCount = 0
  for (const user of users) {
    if (validateUserData(user)) {
      registerUser(user)
      successCount++
    }
  }
  return successCount
}

// Run main
main()
