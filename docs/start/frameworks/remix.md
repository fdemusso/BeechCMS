# Integrate BeechCMS with Remix / React Router v7

Connect BeechCMS to your Remix / React Router application utilizing edge loaders, robust server fetching, and typed route hooks.

<LlmPromptNode
  framework="Remix"
  title="Remix Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Remix integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your Remix project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client

Create a server-side client instance in `app/lib/beech.server.ts`:

```typescript
// app/lib/beech.server.ts
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
  baseUrl: process.env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: process.env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

Add your environment variables to `.env`:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

## Step 3: Server Loaders with `json`

Fetch data in the route `loader` and extract results safely:

```tsx
// app/routes/posts._index.tsx
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, Link } from '@remix-run/react'
import { beech } from '~/lib/beech.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await beech.content('posts').list({
    sort: { created_at: 'desc' },
    limit: 12
  })

  return json({
    posts: result.data ? result.data.data : []
  })
}

export default function PostsRoute() {
  const { posts } = useLoaderData<typeof loader>()

  return (
    <main className="container">
      <h1>Blog Posts</h1>
      <div className="grid">
        {posts.map((post) => (
          <article key={post.id} className="card">
            {post.cover_image && <img src={post.cover_image} alt={post.title} />}
            <h2>{post.title}</h2>
            <Link to={`/posts/${post.slug}`}>Read Article →</Link>
          </article>
        ))}
      </div>
    </main>
  )
}
```

## Step 4: Dynamic Post Route with Edge Loader and RichText

```tsx
// app/routes/posts.$slug.tsx
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { beech } from '~/lib/beech.server'
import { renderRichText } from '@beechcms/client/richtext'

export async function loader({ params }: LoaderFunctionArgs) {
  const { slug } = params
  if (!slug) throw new Response('Slug required', { status: 400 })

  const result = await beech.content('posts').get({ slug })

  if (result.error || !result.data) {
    throw new Response('Post Not Found', { status: 404 })
  }

  return json({ post: result.data.data })
}

export default function PostDetailRoute() {
  const { post } = useLoaderData<typeof loader>()
  const bodyHtml = renderRichText(post.body)

  return (
    <article className="post-detail">
      <h1>{post.title}</h1>
      {post.cover_image && <img src={post.cover_image} alt={post.title} />}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </article>
  )
}
```
