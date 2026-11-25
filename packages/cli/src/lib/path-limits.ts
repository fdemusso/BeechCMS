// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Longest project path (in characters) that still holds wrangler's local D1 file on Windows:
 * `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<64 hex>.sqlite` is appended to it, and a
 * path past MAX_PATH makes `wrangler d1` fail with an opaque "internal error". Measured: a 129
 * character project path works, 133 does not; the margin is deliberate.
 */
export const WINDOWS_LOCAL_STATE_PATH_LIMIT = 125

/**
 * Explains the "internal error" a deep Windows path causes in the local D1 emulator, or returns
 * null when the path cannot be the cause.
 */
export function localStatePathHint(projectDir: string, platform: NodeJS.Platform = process.platform): string | null {
  if (platform !== 'win32' || projectDir.length <= WINDOWS_LOCAL_STATE_PATH_LIMIT) return null
  return `This project path is ${projectDir.length} characters long. On Windows the local database file can exceed the 260 character path limit, which wrangler reports as "internal error". Move the project to a shorter folder (for example C:/dev/my-app) or enable Windows long paths.`
}
