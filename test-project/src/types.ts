/**
 * Type definitions for the test project
 */

// User interface
export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
}

// User creation DTO
export interface CreateUserDto {
  email: string
  name: string
  password: string
}

// API response wrapper
export interface ApiResponse<T> {
  data: T
  success: boolean
  error?: string
}

// Pagination params
export type PaginationParams = {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// User role enum
export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

// Config type alias
export type Config = {
  apiUrl: string
  timeout: number
  retries: number
}

// Helper type
type Nullable<T> = T | null
