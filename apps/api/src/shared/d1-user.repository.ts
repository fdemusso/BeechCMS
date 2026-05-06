/// <reference types="@cloudflare/workers-types" />
import type { IUserRepository, UserRecord, NewUserInput } from '@beechcms/core'

type UserRow = {
  id: string
  email: string
  name: string | null
  password_hash: string
  role: string
  avatar_url: string | null
  notification_prefs: string
}

function rowToRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    avatarUrl: row.avatar_url,
    notificationPreferences: row.notification_prefs,
  }
}

export class D1UserRepository implements IUserRepository {
  constructor(private readonly db: D1Database) {}

  async countAll(): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM users')
      .first<{ count: number }>()
    return result?.count ?? 0
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, password_hash, role, avatar_url, notification_prefs FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first<UserRow>()
    return row ? rowToRecord(row) : null
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, password_hash, role, avatar_url, notification_prefs FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserRow>()
    return row ? rowToRecord(row) : null
  }

  async create(user: NewUserInput): Promise<void> {
    await this.db
      .prepare('INSERT INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, user.email, user.passwordHash, user.role, user.name)
      .run()
  }

  async updateProfile(userId: string, fields: { name?: string; email?: string }): Promise<void> {
    const columnAssignments: string[] = []
    const boundValues: unknown[] = []

    if (fields.name !== undefined) {
      columnAssignments.push('name = ?')
      boundValues.push(fields.name)
    }
    if (fields.email !== undefined) {
      columnAssignments.push('email = ?')
      boundValues.push(fields.email)
    }

    if (columnAssignments.length === 0) return

    boundValues.push(userId)
    await this.db
      .prepare(`UPDATE users SET ${columnAssignments.join(', ')} WHERE id = ?`)
      .bind(...boundValues)
      .run()
  }

  async updatePasswordHash(userId: string, newPasswordHash: string): Promise<void> {
    await this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newPasswordHash, userId)
      .run()
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
    await this.db
      .prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
      .bind(avatarUrl, userId)
      .run()
  }

  async updateNotificationPreferences(userId: string, preferencesJson: string): Promise<void> {
    await this.db
      .prepare('UPDATE users SET notification_prefs = ? WHERE id = ?')
      .bind(preferencesJson, userId)
      .run()
  }

  async emailBelongsToAnotherUser(email: string, currentUserId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1')
      .bind(email, currentUserId)
      .first()
    return row !== null
  }
}
