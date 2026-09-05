# Integrate BeechCMS with Next.js

Integrate BeechCMS with Next.js (App Router, Server Components, and static parameters) using the official `@beechcms/client` SDK.

<LlmPromptNode
  framework="Next.js"
  title="Next.js Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Next.js integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in Next.js, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a Next.js app

Create a new Next.js project with App Router, TypeScript, and Tailwind CSS:

```bash
npx create-next-app@latest my-next-app --typescript --tailwind --app
cd my-next-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your Next.js project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Create a `.env.local` file in your Next.js project root:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

> In local development, the default read key is pre-configured. In production, set these in your hosting provider environment settings.

## 5. Initialize the Beech client

Create `src/lib/beech.ts` to instantiate a typed server-side client singleton:

```typescript
// src/lib/beech.ts
import { createBeechServerClient } from '@beechcms/client/server'

export interface Article {
  id: string
  title: string
  slug: string
  cover_image?: string
  body: string | Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface AppRegistry {
  articles: Article
}

export const beech = createBeechServerClient<AppRegistry>({
  baseUrl: process.env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: process.env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

## 6. Query and render in Server Components

Replace `src/app/page.tsx` with an asynchronous React Server Component that fetches content directly at the edge or during build time:

```tsx
// src/app/page.tsx
import { beech } from '@/lib/beech'
import { renderRichText } from '@beechcms/client/richtext'
import Link from 'next/link'

export const revalidate = 60 // Revalidate cache every 60 seconds (ISR)

export default async function HomePage() {
  const result = await beech.content('articles').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  const articles = result.data ? result.data.data : []

  return (
    <main className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-8">BeechCMS + Next.js</h1>

      {articles.length === 0 ? (
        <p className="text-gray-500">
          No articles found. Publish an article in the BeechCMS dashboard to see it here.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {articles.map((article) => (
            <article
              key={article.id}
              className="border rounded-lg p-6 shadow-sm hover:shadow-md transition"
            >
              {article.cover_image && (
                <img
                  src={article.cover_image}
                  alt={article.title}
                  className="w-full h-48 object-cover rounded-md mb-4"
                />
              )}
              <h2 className="text-xl font-semibold mb-2">{article.title}</h2>
              <div
                className="text-gray-600 line-clamp-3 mb-4 text-sm"
                dangerouslySetInnerHTML={{ __html: renderRichText(article.body) }}
              />
              <Link
                href={`/articles/${article.slug}`}
                className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
              >
                Read article →
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
```

### Dynamic Routes with `generateStaticParams` (Optional)

To statically generate dedicated article pages, create `src/app/articles/[slug]/page.tsx`:

```tsx
// src/app/articles/[slug]/page.tsx
import { beech } from '@/lib/beech'
import { renderRichText } from '@beechcms/client/richtext'
import { notFound } from 'next/navigation'

interface ArticlePageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const result = await beech.content('articles').list({ limit: 100 })
  const articles = result.data ? result.data.data : []
  return articles.map((article) => ({ slug: article.slug }))
}

export default async function ArticleDetailPage({ params }: ArticlePageProps) {
  const { slug } = await params
  const result = await beech.content('articles').get({ slug })

  if (result.error || !result.data) {
    notFound()
  }

  const article = result.data.data
  const bodyHtml = renderRichText(article.body)

  return (
    <article className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-4xl font-extrabold mb-4">{article.title}</h1>
      {article.cover_image && (
        <img
          src={article.cover_image}
          alt={article.title}
          className="w-full rounded-lg mb-8"
        />
      )}
      <div
        className="prose lg:prose-lg"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  )
}
```

## 7. Start the app

Run the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You will see your BeechCMS content rendered on screen via Server Components.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Ensure your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `BEECH_READ_KEY` to your `PUBLIC_READ_API_KEY`.
- **Edge Caching**: Next.js Server Components cache responses automatically. Use `export const revalidate = 60` or Next.js `revalidateTag` inside webhook endpoints to invalidate content instantly when published.

## Cloudflare Edge Deployment

When deploying Next.js App Router to Cloudflare:

- **Cloudflare OpenNext (`@opennextjs/cloudflare`)**: The standard, officially supported bridge to run Next.js App Router, streaming SSR, and Server Actions on Cloudflare Workers. Run `npx @opennextjs/cloudflare@latest` to add the worker adapter.
- **Node.js Compatibility Flag**: Next.js requires Node runtime APIs. Add the compatibility flag to your `wrangler.jsonc` (or Cloudflare Pages build settings):
  ```jsonc
  "compatibility_flags": ["nodejs_compat"]
  ```
- **Instant On-Demand Revalidation via Webhooks**: Instead of static polling intervals, invalidate Next.js caches on demand whenever a Fruit is published in BeechCMS. Use `@beechcms/client/webhooks` inside a Route Handler (`app/api/revalidate/route.ts`) to verify BeechCMS HMAC signatures and invoke `revalidateTag()` across all edge isolates.

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
