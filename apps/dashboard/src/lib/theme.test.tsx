// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from './theme'

let systemDark = false
let mediaListener: (() => void) | null = null

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('system')}>system</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  systemDark = false
  mediaListener = null
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark
    },
    addEventListener: (_: string, listener: () => void) => {
      mediaListener = listener
    },
    removeEventListener: () => {
      mediaListener = null
    },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ThemeProvider', () => {
  it('defaults to the system theme and applies it to <html>', () => {
    systemDark = true
    render(<ThemeProvider><Probe /></ThemeProvider>)

    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('restores a stored choice', () => {
    localStorage.setItem('beech-theme', 'dark')
    render(<ThemeProvider><Probe /></ThemeProvider>)

    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem('beech-theme', 'purple')
    render(<ThemeProvider><Probe /></ThemeProvider>)

    expect(screen.getByTestId('theme').textContent).toBe('system')
  })

  it('persists setTheme and toggles the class', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)

    act(() => screen.getByText('dark').click())

    expect(localStorage.getItem('beech-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('follows OS changes while the choice is "system"', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('resolved').textContent).toBe('light')

    systemDark = true
    act(() => mediaListener?.())

    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not follow OS changes when an explicit theme is chosen', () => {
    localStorage.setItem('beech-theme', 'light')
    render(<ThemeProvider><Probe /></ThemeProvider>)

    systemDark = true
    act(() => mediaListener?.())

    expect(screen.getByTestId('resolved').textContent).toBe('light')
  })

  it('syncs the choice made in another tab', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)

    localStorage.setItem('beech-theme', 'dark')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'beech-theme' }))
    })

    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })
})
