# Integrate BeechCMS with React

Connect your React single-page application (Vite, Next.js client components, or SPA) to BeechCMS using the official `@beechcms/client` SDK.

<LlmPromptNode
  framework="React"
  title="React Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your React integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in React, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a React app

Create a new React project with TypeScript using the [Vite](https://vitejs.dev/) template:

```bash
npm create vite@latest my-react-app -- --template react-ts
cd my-react-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your React project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Create a `.env.local` file in your React project root:

```bash
VITE_BEECH_API_URL=http://localhost:8789
VITE_BEECH_READ_KEY=dev-read-key-changeme
```

> In local development, the default read key is pre-configured. In production, use the `PUBLIC_READ_API_KEY` set in your Cloudflare Worker environment.

## 5. Initialize the Beech client

Create `src/lib/beech.ts` to instantiate the browser client with strong TypeScript typing:

```typescript
// src/lib/beech.ts
import { createBeechBrowserClient } from '@beechcms/client/browser'

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

export const beech = createBeechBrowserClient<AppRegistry>({
  baseUrl: import.meta.env.VITE_BEECH_API_URL || 'http://localhost:8789',
  apiKey: import.meta.env.VITE_BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

## 6. Query and render content

Replace the contents of `src/App.tsx` with a complete component that fetches articles and renders TipTap rich text via `renderRichText`:

```tsx
// src/App.tsx
import { useEffect, useState } from 'react'
import { beech, type Article } from './lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

export default function App() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadArticles() {
      try {
        setLoading(true)
        const result = await beech.content('articles').list({
          sort: { created_at: 'desc' },
          limit: 10
        })

        if (result.error) {
          setError(result.error.detail || 'Failed to load articles')
        } else if (result.data) {
          setArticles(result.data.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArticles()
  }, [])

  if (loading) {
    return <p style={{ padding: '2rem' }}>Loading articles...</p>
  }

  if (error) {
    return <p style={{ padding: '2rem', color: '#ef4444' }}>Error: {error}</p>
  }

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>BeechCMS + React</h1>
      {articles.length === 0 ? (
        <p>No articles found. Create your first fruit in the BeechCMS dashboard!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {articles.map((article) => (
            <article
              key={article.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem'
              }}
            >
              <h2 style={{ marginTop: 0 }}>{article.title}</h2>
              <div
                dangerouslySetInnerHTML={{ __html: renderRichText(article.body) }}
              />
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
```

## 7. Start the app

Run the Vite development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You will see your BeechCMS articles rendered directly on screen.

## Production requirements

The quickstart procedure in this guide optimizes for getting you to a working app quickly. Before deploying to production:

- **Configure Seed Permissions**: Verify that your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `VITE_BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `VITE_BEECH_READ_KEY` to the `PUBLIC_READ_API_KEY` defined in your Cloudflare environment variables.
- **Client Security**: Notice that `@beechcms/client/browser` is physically read-only. Mutation methods (`create`, `update`, `delete`) are omitted from browser bundles to keep your administrative write keys secure.

## Cloudflare Edge Deployment

When deploying your React frontend to Cloudflare Pages:

- **Zero-Cost Static Hosting**: Pure React SPAs compile into static assets (`dist/`). Connect your repository to Cloudflare Pages, set the build command to `npm run build`, and output directory to `dist`. Cloudflare serves it globally across 300+ edge locations with unlimited bandwidth and zero compute costs.
- **SPA Routing Fallback (`_redirects`)**: To prevent 404 errors when visitors refresh deep URLs (e.g., `/articles/spring-release`), create a `public/_redirects` file:
  ```text
  /*    /index.html   200
  ```
- **CORS & Same-Zone Routing**:
  - In your BeechCMS Worker configuration, add your Pages domain (e.g. `https://my-app.pages.dev`) to the `CORS_ORIGINS` environment variable.
  - *Edge Pro-Tip (Zero CORS Latency)*: On a custom domain managed by Cloudflare, route `/api/*` to your BeechCMS Worker and `/*` to your React Pages site within the same zone. Serving both under the same origin completely eliminates CORS preflight latency.

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
