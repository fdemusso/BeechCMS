# Integrate BeechCMS with Astro

Build blazing fast, content-driven websites with Astro and BeechCMS using zero client-side JavaScript by default.

<LlmPromptNode
  framework="Astro"
  title="Astro Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Astro integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in Astro, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create an Astro app

Create a new Astro project using the official template:

```bash
npm create astro@latest my-astro-app -- --template minimal --typescript strict
cd my-astro-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your Astro project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Create a `.env` file in your Astro project root:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

> In local development, the default read key is pre-configured. In production, set these variables in your deployment environment.

## 5. Initialize the Beech client

Create `src/lib/beech.ts` to instantiate a typed server-side client module:

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
  baseUrl: import.meta.env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: import.meta.env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

## 6. Query and render content

Replace `src/pages/index.astro` with an Astro component that queries BeechCMS at build time (or on demand in SSR mode) and renders articles:

```astro
---
// src/pages/index.astro
import { beech } from '../lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

const result = await beech.content('articles').list({
  sort: { created_at: 'desc' },
  limit: 10
})

const articles = result.data ? result.data.data : []
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BeechCMS + Astro</title>
  </head>
  <body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem;">
    <h1>BeechCMS + Astro</h1>

    {articles.length === 0 ? (
      <p>No articles found. Plant your first article in the BeechCMS dashboard!</p>
    ) : (
      <div style="display: grid; gap: 1.5rem;">
        {articles.map((article) => (
          <article style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem;">
            {article.cover_image && (
              <img src={article.cover_image} alt={article.title} style="max-width: 100%; border-radius: 4px;" />
            )}
            <h2 style="margin-top: 0.5rem;">{article.title}</h2>
            <div set:html={renderRichText(article.body)} />
            <a href={`/articles/${article.slug}`}>Read article →</a>
          </article>
        ))}
      </div>
    )}
  </body>
</html>
```

### Static Generation with `getStaticPaths` (Optional)

To statically generate detail pages for every published article, create `src/pages/articles/[slug].astro`:

```astro
---
// src/pages/articles/[slug].astro
import { beech, type Article } from '../../lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

export async function getStaticPaths() {
  const result = await beech.content('articles').list({ limit: 100 })
  const articles = result.data ? result.data.data : []
  return articles.map((article) => ({
    params: { slug: article.slug },
    props: { article }
  }))
}

const { article } = Astro.props as { article: Article }
const bodyHtml = renderRichText(article.body)
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{article.title}</title>
  </head>
  <body style="font-family: sans-serif; max-width: 700px; margin: 0 auto; padding: 2rem;">
    <article>
      <h1>{article.title}</h1>
      {article.cover_image && (
        <img src={article.cover_image} alt={article.title} style="max-width: 100%; border-radius: 6px;" />
      )}
      <div set:html={bodyHtml} />
    </article>
  </body>
</html>
```

## 7. Start the app

Run the Astro development server:

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser. You will see your BeechCMS content rendered on screen with zero client-side JavaScript.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Ensure your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `BEECH_READ_KEY` to your `PUBLIC_READ_API_KEY`.
- **Zero-JS by Default**: Astro executes data fetching on the server/build isolate and ships zero client-side JavaScript by default, making it ideal for content-heavy sites.

## Cloudflare Edge Deployment

When deploying Astro to Cloudflare:

- **Zero-Cost Static Mode (`output: 'static'`)**: By default, Astro compiles into pure static HTML and assets (`dist/`). Deploy directly to Cloudflare Pages with zero worker execution costs and instant global CDN delivery.
- **On-Demand Edge SSR (`output: 'server'`)**: If you need on-demand rendering or dynamic auth, add the official Cloudflare adapter:
  ```bash
  npx astro add cloudflare
  ```
- **Accessing Edge Geolocation Context**: In SSR mode, access Cloudflare's visitor context (country, city, ASN) directly inside frontmatter via `Astro.locals`:
  ```astro
  ---
  const country = Astro.locals.runtime?.cf?.country || 'US'
  ---
  ```

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
