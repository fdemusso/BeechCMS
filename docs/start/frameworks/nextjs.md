# Integrate BeechCMS with Next.js

Integrate BeechCMS with Next.js (App Router, Server Components, and static parameters) using the official `@beechcms/client` SDK.

<LlmPromptNode
  framework="Next.js"
  title="Next.js Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Next.js integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your Next.js project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client

Create a server-side client singleton in `lib/beech.ts`:

```typescript
// lib/beech.ts
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

Add your environment variables to `.env.local`:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

## Step 3: Fetching Content in Server Components

Fetch content directly inside React Server Components with tag-based caching:

```tsx
// app/posts/page.tsx
import { beech } from '@/lib/beech'
import Link from 'next/link'

export const revalidate = 60 // Revalidate every 60 seconds (ISR)

export default async function PostsPage() {
  const result = await beech.content('posts').list({
    sort: { created_at: 'desc' },
    limit: 20
  })

  const posts = result.data ? result.data.data : []

  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Latest Posts</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <article key={post.id} className="border rounded-lg p-4">
            {post.cover_image && (
              <img
                src={post.cover_image}
                alt={post.title}
                className="w-full h-48 object-cover rounded-md mb-4"
              />
            )}
            <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
            <Link href={`/posts/${post.slug}`} className="text-blue-600 hover:underline">
              Read More →
            </Link>
          </article>
        ))}
      </div>
    </main>
  )
}
```

## Step 4: Dynamic Routes with `generateStaticParams` and RichText

Query single entries using `beech.content('posts').get({ slug })` and render rich text with `renderRichText`:

```tsx
// app/posts/[slug]/page.tsx
import { beech } from '@/lib/beech'
import { renderRichText } from '@beechcms/client/richtext'
import { notFound } from 'next/navigation'

interface PostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const result = await beech.content('posts').list({ limit: 100 })
  const posts = result.data ? result.data.data : []
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function PostDetailPage({ params }: PostPageProps) {
  const { slug } = await params
  const result = await beech.content('posts').get({ slug })

  if (result.error || !result.data) {
    notFound()
  }

  const post = result.data.data
  const bodyHtml = renderRichText(post.body)

  return (
    <article className="max-w-2xl mx-auto py-12">
      <h1 className="text-4xl font-extrabold mb-4">{post.title}</h1>
      {post.cover_image && (
        <img src={post.cover_image} alt={post.title} className="w-full rounded-lg mb-8" />
      )}
      <div className="prose lg:prose-lg" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </article>
  )
}
```
