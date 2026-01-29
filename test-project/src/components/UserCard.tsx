/**
 * UserCard Component - displays user information
 */
import type { User } from '../types'

// Props interface for UserCard
export interface UserCardProps {
  user: User
  onEdit?: (user: User) => void
  onDelete?: (userId: string) => void
}

/**
 * UserCard component displays a single user's information
 */
export function UserCard({ user, onEdit, onDelete }: UserCardProps): JSX.Element {
  const handleEdit = (): void => {
    onEdit?.(user)
  }

  const handleDelete = (): void => {
    onDelete?.(user.id)
  }

  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <div className="actions">
        <button onClick={handleEdit}>Edit</button>
        <button onClick={handleDelete}>Delete</button>
      </div>
    </div>
  )
}

// Higher-order component for loading state
export const withLoading = <P extends object>(
  Component: React.ComponentType<P>
): React.FC<P & { loading?: boolean }> => {
  return function WithLoadingComponent({ loading, ...props }: P & { loading?: boolean }) {
    if (loading) {
      return <div>Loading...</div>
    }
    return <Component {...(props as P)} />
  }
}

// Render function for user list
export const renderUserList = (users: User[]): JSX.Element[] => {
  return users.map((user) => <UserCard key={user.id} user={user} />)
}

// Default export
export default UserCard
