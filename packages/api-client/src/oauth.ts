// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * OAuth 2.1 authorization-code-with-PKCE flow for the MCP server, and refresh-token exchange.
 *
 * @remarks
 * Drives a loopback HTTP listener and the system browser to complete the authorization-code
 * flow (RFC 7636 PKCE, no client secret), and exchanges an authorization code or a refresh
 * token for a {@link TokenGrant} against `POST /oauth/token`.
 *
 * @module
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { deriveCodeChallenge } from '@beechcms/core'
import { BeechClientError } from './errors.js'

/** Resolved OAuth configuration for one authorization attempt. */
export interface OAuthConfig {
  /** Origin of the token endpoint (`BEECH_API_URL`). */
  apiUrl: string
  /** Origin the *browser* opens for `/oauth/authorize` (`BEECH_AUTH_URL`, default `apiUrl`). */
  authUrl: string
  /** Registered client id (`BEECH_OAUTH_CLIENT_ID`, default `'beech-mcp'`). */
  clientId: string
  /** Space-delimited scopes requested (`BEECH_OAUTH_SCOPE`, default `'schema:read schema:write'`). */
  scope: string
  /** Milliseconds to wait for the browser round-trip (`BEECH_OAUTH_TIMEOUT_MS`, default 180000). */
  timeoutMs: number
  /** Loopback path the browser is redirected to. MUST match the client's registered
   *  `redirect_uris` pathname — `matchesRegisteredRedirectUri` compares protocol + hostname +
   *  pathname and ignores only the port. Default '/oauth/callback' (client `beech-mcp`). */
  callbackPath?: string
}

/** The credential pair returned by `POST /oauth/token`, plus the derived absolute expiry. */
export interface TokenGrant {
  accessToken: string
  refreshToken: string
  scope: string
  expiresAt: number
}

/** PKCE material for a single authorization request (RFC 7636). */
export interface PkcePair {
  /** 43-char base64url verifier — satisfies `isValidCodeVerifier` from @beechcms/core. */
  verifier: string
  /** BASE64URL(SHA256(ASCII(verifier))). */
  challenge: string
}

/** base64url, unpadded (RFC 7636 §A). */
export function base64Url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 random bytes -> 43-char verifier, plus its S256 challenge. */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = base64Url(randomBytes(32))
  const challenge = await deriveCodeChallenge(verifier)
  return { verifier, challenge }
}

/** Response body shape of `POST /oauth/token` on success. */
interface TokenResponseBody {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

/** RFC 6749 §5.2 token error body. */
interface TokenErrorBody {
  error: string
  error_description?: string
}

async function exchangeToken(apiUrl: string, body: URLSearchParams): Promise<TokenGrant> {
  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new BeechClientError(`OAuth token request rate-limited.${retryAfter ? ` Retry after ${retryAfter}s.` : ''}`)
  }

  if (!response.ok) {
    const problem = (await response.json()) as TokenErrorBody
    throw new BeechClientError(`OAuth token request failed (${problem.error}): ${problem.error_description ?? ''}`)
  }

  const data = (await response.json()) as TokenResponseBody
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

/** Self-contained loopback landing page; no external asset so it renders offline. */
function renderClosePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorization Successful - BeechCMS</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --card-border: #e2e8f0;
      --text-primary: #0f172a;
      --text-muted: #64748b;
      --success-bg: #dcfce7;
      --success-border: #bbf7d0;
      --success-text: #15803d;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --card-bg: #121215;
        --card-border: #27272a;
        --text-primary: #f4f4f5;
        --text-muted: #a1a1aa;
        --success-bg: rgba(34, 197, 94, 0.15);
        --success-border: rgba(34, 197, 94, 0.3);
        --success-text: #4ade80;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      max-width: 380px;
      width: 100%;
      padding: 2.5rem 2rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .icon-badge {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background-color: var(--success-bg);
      border: 1px solid var(--success-border);
      color: var(--success-text);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
    }
    .icon-badge svg {
      width: 1.75rem;
      height: 1.75rem;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }
    p {
      color: var(--text-muted);
      font-size: 0.875rem;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>Authorization Successful</h1>
    <p>You can safely close this tab and return to your terminal or editor.</p>
  </div>
  <script>try { window.close(); } catch (_) {}</script>
</body>
</html>`
}

interface CallbackResult {
  code: string
}

/** Starts the loopback listener and resolves with the authorization code once the
 *  browser redirects back with a matching `state`, or rejects on mismatch/error/timeout. */
function waitForCallback(state: string, timeoutMs: number, callbackPath: string): { redirectUriPromise: Promise<string>; result: Promise<CallbackResult> } {
  let resolvePort: (uri: string) => void
  const redirectUriPromise = new Promise<string>(resolve => { resolvePort = resolve })

  const result = new Promise<CallbackResult>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== callbackPath) {
        res.writeHead(404)
        res.end()
        return
      }

      const callbackState = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')

      if (callbackState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('state mismatch')
        finish(() => reject(new BeechClientError('OAuth callback state mismatch. Aborting for safety.')))
        return
      }

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('authorization error')
        finish(() => reject(new BeechClientError(url.searchParams.get('error_description') ?? error)))
        return
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(renderClosePage())
        finish(() => resolve({ code }))
        return
      }

      res.writeHead(404)
      res.end()
    })

    let timer: ReturnType<typeof setTimeout>
    let finished = false
    function finish(action: () => void): void {
      if (finished) return
      finished = true
      clearTimeout(timer)
      server.close(() => action())
    }

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolvePort(`http://127.0.0.1:${port}${callbackPath}`)
    })

    timer = setTimeout(() => {
      finish(() => reject(new BeechClientError(`Authorization timed out after ${timeoutMs / 1000}s. Re-run the tool and complete the consent in the browser.`)))
    }, timeoutMs)
  })

  return { redirectUriPromise, result }
}

/** Launches the system browser at `url`, detached from the MCP process. Never
 *  writes to stdout — that channel carries the MCP JSON-RPC transport. */
function openBrowser(url: string): void {
  const platform = process.platform
  const child =
    platform === 'darwin' ? spawn('open', [url], { detached: true, stdio: 'ignore' }) :
    platform === 'win32' ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }) :
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })

  child.on('error', () => {
    process.stderr.write(`Open this URL to continue: ${url}\n`)
  })
  process.stderr.write(`Open this URL to continue: ${url}\n`)
  child.unref()
}

/** Runs the full browser authorization-code flow and returns a fresh grant. */
export async function authorize(config: OAuthConfig): Promise<TokenGrant> {
  const { verifier, challenge } = await createPkcePair()
  const state = base64Url(randomBytes(16))
  const callbackPath = config.callbackPath ?? '/oauth/callback'

  const { redirectUriPromise, result } = waitForCallback(state, config.timeoutMs, callbackPath)
  const redirectUri = await redirectUriPromise

  const authorizeUrl = new URL(`${config.authUrl}/oauth/authorize`)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', config.scope)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  openBrowser(authorizeUrl.toString())

  const { code } = await result

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  })

  return exchangeToken(config.apiUrl, body)
}

/** Exchanges a refresh token for a rotated pair. Throws BeechClientError on
 *  `invalid_grant` so the caller can fall back to `authorize()`. */
export async function refresh(config: OAuthConfig, refreshToken: string): Promise<TokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  })
  return exchangeToken(config.apiUrl, body)
}
