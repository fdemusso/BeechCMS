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

export type SettingsTab = 'profile' | 'interface' | 'security' | 'storage' | 'notifications'
