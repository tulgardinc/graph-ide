/**
 * Validation utility functions
 * This file demonstrates various function call patterns within validators
 */
import type { CreateUserDto } from '../types'

// Email regex pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Minimum password length
const MIN_PASSWORD_LENGTH = 8

// Maximum name length
const MAX_NAME_LENGTH = 100

/**
 * Validate an email address format
 */
export function validateEmail(email: string): boolean {
  if (!isNotEmpty(email)) {
    return false
  }
  return EMAIL_REGEX.test(email)
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): boolean {
  if (!isNotEmpty(password)) {
    return false
  }
  if (!hasMinLength(password, MIN_PASSWORD_LENGTH)) {
    return false
  }
  return hasSpecialCharacter(password)
}

/**
 * Validate a name field
 */
export function validateName(name: string): boolean {
  if (!isNotEmpty(name)) {
    return false
  }
  if (!isInRange(name.length, 1, MAX_NAME_LENGTH)) {
    return false
  }
  return isAlphanumeric(name)
}

/**
 * Validate a complete user object
 */
export function validateUser(user: CreateUserDto): boolean {
  const nameValid = validateName(user.name)
  const emailValid = validateEmail(user.email)
  const passwordValid = validatePassword(user.password)

  return nameValid && emailValid && passwordValid
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
 * Check if string has minimum length
 */
export function hasMinLength(value: string, minLength: number): boolean {
  return value.length >= minLength
}

/**
 * Check if string contains a special character
 */
export function hasSpecialCharacter(value: string): boolean {
  return /[!@#$%^&*(),.?":{}|<>]/.test(value)
}

/**
 * Check if string is alphanumeric (with spaces)
 */
export function isAlphanumeric(value: string): boolean {
  return /^[a-zA-Z0-9\s]+$/.test(value)
}

/**
 * Sanitize a string by trimming and removing special characters
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}

/**
 * Sanitize user input - combines multiple sanitization steps
 */
export function sanitizeUserInput(input: string): string {
  let result = sanitizeString(input)
  result = normalizeWhitespace(result)
  return result
}

/**
 * Normalize whitespace in a string
 */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ')
}

/**
 * Full sanitization pipeline
 */
export function fullSanitize(input: string): string {
  let result = sanitizeUserInput(input)
  result = removeNonPrintable(result)
  return result
}

/**
 * Remove non-printable characters
 */
export function removeNonPrintable(input: string): string {
  return input.replace(/[\x00-\x1F\x7F]/g, '')
}

// Type guard for checking if value is a string
export const isString = (value: unknown): value is string => {
  return typeof value === 'string'
}

// Type guard for checking if value is a number
export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Validate and sanitize - combined operation
 */
export function validateAndSanitize(input: string): { valid: boolean; value: string } {
  const sanitized = fullSanitize(input)
  const valid = isNotEmpty(sanitized)
  return { valid, value: sanitized }
}
