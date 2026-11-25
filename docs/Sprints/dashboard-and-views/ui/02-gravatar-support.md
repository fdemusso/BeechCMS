You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

This sprint covers **UI Refactoring — Sprint 02: Gravatar Support & Avatar Fallback**.

Currently, user profiles in Beech CMS support custom avatars through direct uploads. If an administrator or contributor does not upload a custom avatar file, the dashboard renders their initials using the `AvatarFallback` component (e.g. `AD` or `??`).

This sprint introduces:
1. Automatic fallback to **Gravatar** when a user does not have a custom `avatarUrl`.
2. Hashing the email address using **SHA-256** (the modern standard recommended by Gravatar) on the backend before delivering the user profile payload to the client.
3. Centralized delivery so that the dashboard sidebar (`NavUser`) and the profile settings page (`ProfileTab`) display the Gravatar image automatically without frontend changes.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

1. **Better First-Time UX**: New users or newly invited contributors will automatically have their profile images displayed in the sidebar if they are registered on Gravatar, instead of generic text initials.
2. **Centralized Backend Logic**: Resolving the avatar URL on the backend avoids duplicate client-side hashing logic and prevents the need for asynchronous SHA-256 computation inside synchronous React rendering contexts.
3. **Graceful Fallbacks**: If an email is not registered on Gravatar, it falls back to the standard "Mystery Person" placeholder image using the query parameter `d=mp`.

==========================================================================
SECTION 2 — CURRENT STATE & CODE REUSE
==========================================================================

1. **User Schema**: The `users` table stores `avatar_url` (either absolute R2 URL or null).
2. **SHA-256 Hash Utility**: The package `@beechcms/core` already exports a utility `sha256hex(value: string): Promise<string>` based on the native Web Crypto API (`crypto.subtle.digest`). This runs seamlessly on Cloudflare Workers and Node environments without additional dependencies.
3. **Settings Handlers**: The API handler in `apps/api/src/features/settings/settings.handler.ts` serves the currently logged-in user profile under `GET /api/settings/me`.
4. **Client-Side Avatars & Shadcn UI**:
   - `apps/dashboard/src/components/nav-user.tsx` binds the avatar to `user.avatar` using the Shadcn UI `Avatar` component.
   - `apps/dashboard/src/features/settings/components/profile-tab.tsx` displays the avatar using `<AvatarImage src={profile?.avatarUrl ?? undefined} />`.
   - All UI changes must strictly reuse existing Shadcn UI components from `@/components/ui/` to maintain aesthetic consistency.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

The sprint is divided into two phases:

- **Phase A — Backend: Gravatar Fallback Resolution**
  - Import `sha256hex` in `settings.handler.ts`.
  - In `GET /me`, if `currentUser.avatarUrl` is null or empty, compute the SHA-256 hash of the lowercased, trimmed user email.
  - Return the Gravatar URL with default fallback parameter (`d=mp`).

- **Phase B — Integration Testing & Validation**
  - Add test assertions in the backend test suite verifying that a user with no custom avatar receives their corresponding Gravatar URL when querying `/api/settings/me`.
  - Verify that updating a custom avatar continues to overwrite the Gravatar fallback.

==========================================================================
SECTION 4 — PHASE DETAILS
==========================================================================

### Phase A — Backend: Gravatar Fallback Resolution

#### Files to modify:
- [settings.handler.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/api/src/features/settings/settings.handler.ts)
  Add the import for `sha256hex` and update the `GET /me` route:

  ```typescript
  import { sha256hex } from '@beechcms/core'
  ```

  And inside the `GET /me` handler:

  ```typescript
  // Resolve Gravatar fallback if no custom avatar is present
  let avatarUrl = currentUser.avatarUrl
  if (!avatarUrl && currentUser.email) {
    const emailHash = await sha256hex(currentUser.email.trim().toLowerCase())
    avatarUrl = `https://gravatar.com/avatar/${emailHash}?d=mp`
  }
  ```

---

### Phase B — Integration Testing & Validation

#### Files to modify:
- `apps/api/test/flow-admin-auth.test.ts` (or settings tests)
  Verify the `/api/settings/me` endpoint returns a Gravatar URL fallback when the user's `avatar_url` is database-null.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

1. Run backend tests to verify that auth and settings routes compile and pass:
   ```bash
   pnpm run test
   ```
2. Manually test in the browser:
   - Clear any custom avatar for your admin user in profile settings.
   - Confirm that the dashboard sidebar and settings view now show your Gravatar image (matching your logged-in email).
   - If the email is not registered on Gravatar, verify that the "Mystery Person" placeholder image is displayed.
   - Upload a new custom avatar image and verify that the custom image immediately takes precedence.
