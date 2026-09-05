# Integrate BeechCMS with SvelteKit

Connect BeechCMS to your SvelteKit application using typed server load functions, edge rendering, and TipTap rich text.

<LlmPromptNode
  framework="SvelteKit"
  title="SvelteKit Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your SvelteKit integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your SvelteKit project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client

Create a server-side client instance in `src/lib/server/beech.ts`:

```typescript
// src/lib/server/beech.ts
import { createBeechServerClient } from '@beechcms/client/server'
import { env } from '$env/dynamic/private'

export interface Post {
  id: string
  title: string
  slug: string
  cover_image?: string
  body: string | Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface AppRegistry {
  posts: Post
}

export const beech = createBeechServerClient<AppRegistry>({
  baseUrl: env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

Add your environment variables to `.env`:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

## Step 3: Server Load Function (`+page.server.ts`)

Define your content types and load data using SvelteKit's `PageServerLoad`:

```typescript
// src/routes/posts/+page.server.ts
import { beech } from '$lib/server/beech'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
  const result = await beech.content('posts').list({
    sort: { created_at: 'desc' },
    limit: 12
  })

  return {
    posts: result.data ? result.data.data : []
  }
}
```

## Step 4: Svelte Page Component (`+page.svelte`)

Render the loaded data reactively in Svelte:

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<main class="container">
  <h1>Blog Posts</h1>
  <div class="grid">
    {#each data.posts as post}
      <article class="card">
        {#if post.cover_image}
          <img src={post.cover_image} alt={post.title} />
        {/if}
        <h2>{post.title}</h2>
        <a href={`/posts/${post.slug}`}>Read Article →</a>
      </article>
    {/each}
  </div>
</main>
```

## Step 5: Single Post Detail Page with RichText

In `src/routes/posts/[slug]/+page.server.ts`:

```typescript
// src/routes/posts/[slug]/+page.server.ts
import { beech } from '$lib/server/beech'
import { error } from '@sveltejs/kit'
import { renderRichText } from '@beechcms/client/richtext'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
  const result = await beech.content('posts').get({ slug: params.slug })

  if (result.error || !result.data) {
    throw error(404, 'Post Not Found')
  }

  const post = result.data.data
  return {
    post,
    bodyHtml: renderRichText(post.body)
  }
}
```

In `src/routes/posts/[slug]/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<article class="post-detail">
  <h1>{data.post.title}</h1>
  {#if data.post.cover_image}
    <img src={data.post.cover_image} alt={data.post.title} />
  {/if}
  <div>{@html data.bodyHtml}</div>
</article>
```
