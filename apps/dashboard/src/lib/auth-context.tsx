import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import type { LoginResponse } from './api'
import { setAccessToken, clearAccessToken, refreshToken } from './api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  user: { email: string; name?: string } | null
  setToken: (token: string) => void
  clearToken: () => void
}

const AuthContext = createContext<AuthState | null>(null)

function decodeUser(token: string): { email: string; name?: string } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { email: payload.email ?? '', name: payload.name ?? 'Admin' }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null)

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
      .catch((err) => {
        // If the refresh failed (e.g. 401 or network error), we are unauthenticated
        clearToken()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, setToken, clearToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
