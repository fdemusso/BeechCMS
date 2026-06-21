# BeechCMS Development Commands

Beech requires Docker. There's no "lightweight" mode; those who can't or don't want to have Docker can't develop on Beech.

## Root (runs all packages via Turborepo)
- `pnpm run dev:full` : SINGLE development command: Full Docker stack + API + Dashboard
- `pnpm run dev` : Alias di dev:full
- `pnpm run dev:tunnel-url` : Stampa la URL Cloudflare Quick Tunnel
- `pnpm run dev:mailpit:reset` : Svuota la inbox Mailpit
- `pnpm run dev:logs:mailpit` : Stream log Mailpit
- `pnpm run dev:logs:sqlite` : Stream log SQLite Web
- `pnpm run dev:logs:tunnel` : Stream log Cloudflared Tunnel
- `pnpm run dev:logs:minio` : Stream log MinIO
- `pnpm run dev:stop` : Stop dei container (mantiene i volumi)
- `pnpm run dev:reset` : Stop + rimozione volumi (reset completo)
- `pnpm run build` : Build all packages
- `pnpm run test` : Run all tests

## API (`apps/api`)
- `pnpm run dev` : wrangler dev --port 8789
- `pnpm run test` : vitest run
- `pnpm run test -- --reporter=verbose` : verbose output; single file: vitest run src/test/foo.test.ts
- `pnpm run db:migrate:local` : apply ALL D1 migrations locally
- `pnpm run db:reset:local` : wipe .wrangler state + re-migrate from scratch
- `pnpm run deploy` : wrangler deploy --minify (production)
- `pnpm run cf-typegen` : regenerate Cloudflare binding types

## Dashboard (`apps/dashboard`)
- `pnpm run dev` : vite (port 5173, proxies /api and /auth to port 8789)
- `pnpm run build` : tsc -b && vite build
- `pnpm run lint` : eslint .
- `pnpm run test` : vitest run

## Core package (`packages/core`)
- `pnpm run build` : tsc (compiles to dist/)
- `pnpm run dev` : tsc -w (watch mode — required before API/Dashboard can import @beech/core)
- `pnpm run lint` : eslint .
