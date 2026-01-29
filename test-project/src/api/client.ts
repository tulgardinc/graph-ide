/**
 * API Client for making HTTP requests
 */
import type { ApiResponse, Config } from '../types'

// Default config
export const DEFAULT_CONFIG: Config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3
}

/**
 * API Client class for HTTP communications
 */
export class ApiClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string, timeout: number = 5000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    // Simulated GET request
    console.log(`GET ${this.baseUrl}${endpoint}`)
    return {
      data: {} as T,
      success: true
    }
  }

  async post<T, D>(endpoint: string, data: D): Promise<ApiResponse<T>> {
    // Simulated POST request
    console.log(`POST ${this.baseUrl}${endpoint}`, data)
    return {
      data: {} as T,
      success: true
    }
  }

  async put<T, D>(endpoint: string, data: D): Promise<ApiResponse<T>> {
    // Simulated PUT request
    console.log(`PUT ${this.baseUrl}${endpoint}`, data)
    return {
      data: {} as T,
      success: true
    }
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    // Simulated DELETE request
    console.log(`DELETE ${this.baseUrl}${endpoint}`)
    return {
      data: {} as T,
      success: true
    }
  }
}

// Factory function
export const createApiClient = (config: Partial<Config> = {}): ApiClient => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  return new ApiClient(mergedConfig.apiUrl, mergedConfig.timeout)
}

// Singleton instance
let instance: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (!instance) {
    instance = createApiClient()
  }
  return instance
}
