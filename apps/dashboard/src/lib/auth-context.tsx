// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { setAccessToken, clearAccessToken, refreshToken } from './api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

// Re-checked on mount, on window focus, and on a fixed interval — catches a
// backend reset/restore that happened while this tab stayed open (the SPA
// has no other channel to learn the DB changed underneath it).
const SETUP_POLL_INTERVAL_MS = 30_000

interface AuthState {
  status: AuthStatus
  user: { email: string; name?: string; surname?: string; role?: 'admin' | 'editor' } | null
  /** null = not checked yet. Distinguishing "unknown" from "confirmed false" stops
   *  SetupPage from bouncing a fresh install away before the first check resolves. */
  needsSetup: boolean | null
  setToken: (token: string) => void
  clearToken: () => void
  /** Force an immediate re-check of /auth/setup — call right after the setup
   *  wizard completes, otherwise the stale `needsSetup=true` from the last
   *  poll bounces the user straight back to /setup. */
  recheckSetup: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function decodeUser(token: string): { email: string; name?: string; surname?: string; role?: 'admin' | 'editor' } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { email: payload.email ?? '', name: payload.name ?? 'Admin', surname: payload.surname, role: payload.role }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<{ email: string; name?: string; surname?: string; role?: 'admin' | 'editor' } | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  function setToken(token: string) {
    setAccessToken(token)
    setUser(decodeUser(token))
    setStatus('authenticated')
  }

  function clearToken() {
    clearAccessToken()
    setUser(null)
    setStatus('unauthenticated')
  }

  useEffect(() => {
    refreshToken()
      .then((token) => setToken(token))
      .catch(() => {
        // If the refresh failed (e.g. 401 or network error), we are unauthenticated
        clearToken()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function recheckSetup() {
    try {
      const { data } = await axios.get<{ needsSetup: boolean }>('/auth/setup')
      setNeedsSetup(data.needsSetup)
    } catch {
      // transient network/server error — keep last known state
    }
  }

  useEffect(() => {
    recheckSetup()
    const intervalId = window.setInterval(recheckSetup, SETUP_POLL_INTERVAL_MS)
    window.addEventListener('focus', recheckSetup)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', recheckSetup)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, needsSetup, setToken, clearToken, recheckSetup }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
