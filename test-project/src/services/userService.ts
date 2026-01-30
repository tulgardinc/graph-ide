/**
 * User Service - handles user-related business logic
 */
import { ApiClient } from '../api/client'
import type { User, CreateUserDto, ApiResponse, PaginationParams, UserRole } from '../types'
import { UserRole as UserRoleEnum } from '../types'
import { validateEmail, validatePassword } from '../utils/validators'

/**
 * Service for managing user operations
 */
export class UserService {
  private apiClient: ApiClient

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
  }

  async getUsers(params?: PaginationParams): Promise<User[]> {
    const response = await this.apiClient.get<User[]>('/users')
    return response.data
  }

  async getUserById(id: string): Promise<User | null> {
    const response = await this.apiClient.get<User>(`/users/${id}`)
    return response.success ? response.data : null
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    // Validate input
    if (!validateEmail(dto.email)) {
      throw new Error('Invalid email format')
    }
    if (!validatePassword(dto.password)) {
      throw new Error('Password must be at least 8 characters')
    }

    const response = await this.apiClient.post<User, CreateUserDto>('/users', dto)
    return response.data
  }

  async updateUser(id: string, data: Partial<CreateUserDto>): Promise<User> {
    const response = await this.apiClient.put<User, Partial<CreateUserDto>>(`/users/${id}`, data)
    return response.data
  }

  async deleteUser(id: string): Promise<boolean> {
    const response = await this.apiClient.delete<void>(`/users/${id}`)
    return response.success
  }
}

// Factory function for creating UserService
export const createUserService = (apiClient: ApiClient): UserService => {
  return new UserService(apiClient)
}

/**
 * Check if the given role has admin privileges
 */
export function isAdmin(role: UserRole): boolean {
  return role === UserRoleEnum.Admin
}

/**
 * Get the default role for new users
 */
export function getDefaultRole(): UserRole {
  return UserRoleEnum.User
}

/**
 * Get role display label
 */
export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case UserRoleEnum.Admin:
      return 'Administrator'
    case UserRoleEnum.User:
      return 'Standard User'
    case UserRoleEnum.Guest:
      return 'Guest'
    default:
      return 'Unknown'
  }
}

// Default export as well
export default UserService
