// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export interface NotificationPrefs {
  contentCreate: boolean
  contentUpdate: boolean
  contentDelete: boolean
  mediaUpload: boolean
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  surname: string | null
  avatarUrl: string | null
  notificationPrefs: NotificationPrefs
}

export interface Session {
  id: string
  created_at: number
  expires_at: number
}

export interface ActivityEntry {
  id: string
  action: string
  entity_type: string
  entity_slug: string | null
  details: string | null
  created_at: number
}

export interface OrphanFile {
  key: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: number
}

export interface StorageStats {
  totalBytes: number
  fileCount: number
  orphans: OrphanFile[]
}

export interface GeneralSettings {
  siteTitle: string
  siteLogo?: string
  defaultLanguage: string
  timezone: string
  currency: string
  company: {
    name: string | null
    website: string | null
    abbreviation: string | null
  }
  dateFormat: string
  features?: {
    drafts?: boolean
    media?: boolean
    search?: boolean
    activityLog?: boolean
    email?: boolean
  }
}

export type SettingsTab = 'profile' | 'interface' | 'security' | 'storage' | 'notifications' | 'general'
