// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface UserRecord {
  id: string
  email: string
  name: string | null
  surname: string | null
  passwordHash: string
  role: string
  avatarUrl: string | null
  notificationPreferences: string
}

export interface NewUserInput {
  id: string
  email: string
  passwordHash: string
  role: string
  name: string | null
  surname: string | null
}

export interface IUserRepository {
  /**
   * Returns the total number of registered users.
   * Used to block re-setup when at least one administrator account already exists.
   */
  countAll(): Promise<number>

  /** Retrieves a user by their unique identifier, or null if not found. */
  findById(userId: string): Promise<UserRecord | null>

  /** Retrieves a user by their email address, or null if not found. */
  findByEmail(email: string): Promise<UserRecord | null>

  /** Inserts a new user record. */
  create(user: NewUserInput): Promise<void>

  /** Updates the user's display name, surname, and/or email address. */
  updateProfile(userId: string, fields: { name?: string; surname?: string; email?: string }): Promise<void>

  /** Replaces the user's stored password hash after a successful password change. */
  updatePasswordHash(userId: string, newPasswordHash: string): Promise<void>

  /** Sets or clears the user's avatar URL. */
  updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<void>

  /** Persists the user's notification preferences as a JSON string. */
  updateNotificationPreferences(userId: string, preferencesJson: string): Promise<void>

  /**
   * Checks whether the given email is already registered to a different user.
   * Used during an email change to detect conflicts without exposing whether
   * an unrelated account exists.
   */
  emailBelongsToAnotherUser(email: string, currentUserId: string): Promise<boolean>
}
