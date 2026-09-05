# Integrate BeechCMS with Astro

Build blazing fast, content-driven websites with Astro and BeechCMS using zero client-side JavaScript by default.

<LlmPromptNode
  framework="Astro"
  title="Astro Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Astro integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your Astro project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client

Create a client module in `src/lib/beech.ts`:

```typescript
// src/lib/beech.ts
import { createBeechServerClient } from '@beechcms/client/server'

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
  baseUrl: import.meta.env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: import.meta.env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

Add your environment variables to `.env`:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

## Step 3: Fetching Content in Astro Frontmatter

Query your BeechCMS content directly inside Astro page frontmatter:

```astro
---
// src/pages/index.astro
import { beech } from '../lib/beech'

const result = await beech.content('posts').list({
  sort: { created_at: 'desc' },
  limit: 12
})

const posts = result.data ? result.data.data : []
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BeechCMS + Astro</title>
  </head>
  <body>
    <main>
      <h1>Latest Posts</h1>
      <div class="posts-grid">
        {posts.map((post) => (
          <article class="card">
            {post.cover_image && <img src={post.cover_image} alt={post.title} />}
            <h2>{post.title}</h2>
            <a href={`/posts/${post.slug}`}>Read Article →</a>
          </article>
        ))}
      </div>
    </main>
  </body>
</html>
```

## Step 4: Static Generation with `getStaticPaths` and RichText

Create dynamic pages for each post and render TipTap body content using `renderRichText`:

```astro
---
// src/pages/posts/[slug].astro
import { beech, type Post } from '../../lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

export async function getStaticPaths() {
  const result = await beech.content('posts').list({ limit: 100 })
  const posts = result.data ? result.data.data : []
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post }
  }))
}

const { post } = Astro.props as { post: Post }
const bodyHtml = renderRichText(post.body)
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{post.title}</title>
  </head>
  <body>
    <article>
      <h1>{post.title}</h1>
      {post.cover_image && <img src={post.cover_image} alt={post.title} />}
      <div set:html={bodyHtml} />
    </article>
  </body>
</html>
```
