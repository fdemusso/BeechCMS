// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface TimeTrapTokenResponse {
  token: string
  minDeltaSeconds?: number
}

export async function fetchTimeTrapToken(
  baseUrl: string,
  customFetch?: typeof fetch
): Promise<{ token: string; timestamp: number } | null> {
  const doFetch = customFetch ?? fetch
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const endpoint = `${cleanBase}/api/v1/public/timetrap/token`

  try {
    const res = await doFetch(endpoint, { method: 'GET' })
    if (!res.ok) return null
    const json = (await res.json()) as TimeTrapTokenResponse
    return {
      token: json.token,
      timestamp: Date.now(),
    }
  } catch {
    return null
  }
}
