// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Bell, InfoCircle as Info, CheckCircle, AlertTriangle, XCircle } from 'reicon-react'
import type { Notification, NotificationFilter } from "./types"

const NOTIFICATION_ICONS: Record<string, any> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle
}

export function useNotificationsPopover() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<NotificationFilter>("all")

  const { data: rawNotifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get<any[]>("/content/notifications")
      return data
    },
    refetchInterval: 5 * 60 * 1000, // 5 minuti
    staleTime: 60 * 1000, // 1 minuto
    refetchOnWindowFocus: true
  })

  // Mapping backend -> frontend interface
  const notifications: Notification[] = rawNotifications.map(n => ({
    id: n.id,
    title: n.title,
    description: n.message,
    icon: NOTIFICATION_ICONS[n.type] || Bell,
    isNew: n.is_read === 0,
    createdAt: new Date(n.created_at * 1000)
  }))

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/content/notifications/${id}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  const markUnreadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/content/notifications/${id}/unread`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/content/notifications/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post("/content/notifications/mark-all-read")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  const filteredNotifications =
    filter === "new"
      ? notifications.filter((notification) => notification.isNew)
      : notifications

  const handleMarkSeen = (id: string) => {
    markReadMutation.mutate(id)
  }

  const handleMarkUnseen = (id: string) => {
    markUnreadMutation.mutate(id)
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  const hasUnreadNotifications = notifications.some((notification) => notification.isNew)
  const unreadCount = notifications.filter((notification) => notification.isNew).length

  return {
    notifications: filteredNotifications,
    isLoading,
    filter,
    setFilter,
    hasUnreadNotifications,
    unreadCount,
    handleMarkSeen,
    handleMarkUnseen,
    handleDelete,
    handleMarkAllRead: () => markAllReadMutation.mutate()
  }
}
