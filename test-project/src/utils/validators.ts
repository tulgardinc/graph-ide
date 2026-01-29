/**
 * Validation utility functions
 */

// Email regex pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Minimum password length
const MIN_PASSWORD_LENGTH = 8

/**
 * Validate an email address format
 */
export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH
}

/**
 * Validate a string is not empty
 */
export const isNotEmpty = (value: string): boolean => {
  return value.trim().length > 0
}

/**
 * Validate a number is within range
 */
export const isInRange = (value: number, min: number, max: number): boolean => {
  return value >= min && value <= max
}

/**
 * Sanitize a string by trimming and removing special characters
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}

// Type guard for checking if value is a string
export const isString = (value: unknown): value is string => {
  return typeof value === 'string'
}

// Type guard for checking if value is a number
export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !Number.isNaN(value)
}
