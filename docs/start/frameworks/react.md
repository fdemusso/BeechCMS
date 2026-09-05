# Integrate BeechCMS with React

Connect your React single-page application (Vite, Next.js client components, or Create React App) to BeechCMS using the official `@beechcms/client` SDK.

<LlmPromptNode
  framework="React"
  title="React Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your React integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your React project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client

Create a shared API client in `src/lib/beech.ts` using `createBeechBrowserClient`:

```typescript
// src/lib/beech.ts
import { createBeechBrowserClient } from '@beechcms/client/browser'

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

export const beech = createBeechBrowserClient<AppRegistry>({
  baseUrl: import.meta.env.VITE_BEECH_API_URL || 'http://localhost:8789',
  apiKey: import.meta.env.VITE_BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

Add your environment variables to `.env.local`:

```bash
VITE_BEECH_API_URL=http://localhost:8789
VITE_BEECH_READ_KEY=dev-read-key-changeme
```

## Step 3: Fetching and Rendering Content

Fetch entries reactively with `beech.content('posts').list()` and render TipTap rich text via `renderRichText`:

```tsx
// src/components/PostList.tsx
import React, { useState, useEffect } from 'react'
import { beech, type Post } from '../lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

export function PostList() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPosts() {
      try {
        setLoading(true)
        const result = await beech.content('posts').list({
          sort: { created_at: 'desc' },
          limit: 12
        })

        if (result.error) {
          setError(result.error.detail || 'Failed to load posts')
        } else if (result.data) {
          setPosts(result.data.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
      } finally {
        setLoading(false)
      }
    }

    loadPosts()
  }, [])

  if (loading) return <div>Loading articles...</div>
  if (error) return <div className="text-red-500">Error: {error}</div>

  return (
    <div className="posts-grid">
      {posts.map((post) => (
        <article key={post.id} className="post-card">
          {post.cover_image && (
            <img src={post.cover_image} alt={post.title} className="cover-img" />
          )}
          <h2>{post.title}</h2>
          <div
            className="body-preview"
            dangerouslySetInnerHTML={{ __html: renderRichText(post.body) }}
          />
          <a href={`/posts/${post.slug}`}>Read Article →</a>
        </article>
      ))}
    </div>
  )
}
```
