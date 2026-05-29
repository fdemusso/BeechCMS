// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Notification service contract.
 *
 * High-level port that callers use to emit a notification without knowing
 * about the underlying repository, the database, or background scheduling.
 * Mirrors the email module pattern: handlers depend on the service, the
 * service depends on the repository, the repository depends on D1.
 *
 * @module @beechcms/core/notifications/notification-service
 */
import type { NotificationType } from './notification.repository.js'

export interface CreateNotificationInput {
  title: string
  message: string
  type?: NotificationType
}

export interface INotificationService {
  /**
   * Emit a notification.
   *
   * Implementations decide whether to fire-and-forget (production: schedules
   * the underlying repository write through `executionCtx.waitUntil`) or to
   * wait inline (tests). Like the activity logger, this method MUST NOT
   * throw to the caller: a failed notification must never break the public
   * request that triggered it.
   */
  notify(input: CreateNotificationInput): Promise<void> | void
}
