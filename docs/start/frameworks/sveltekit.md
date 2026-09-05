# Integrate BeechCMS with SvelteKit

Connect BeechCMS to your SvelteKit application using typed server load functions, edge rendering, and TipTap rich text.

<LlmPromptNode
  framework="SvelteKit"
  title="SvelteKit Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your SvelteKit integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in SvelteKit, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a SvelteKit app

Create a new SvelteKit project using the official template:

```bash
npm create svelte@latest my-svelte-app
cd my-svelte-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your SvelteKit project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Create a `.env` file in your SvelteKit project root:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

> In local development, the default read key is pre-configured. In production, configure these in your deployment platform settings.

## 5. Initialize the Beech client

Create `src/lib/server/beech.ts` to instantiate a server-side client:

```typescript
// src/lib/server/beech.ts
import { createBeechServerClient } from '@beechcms/client/server'
import { env } from '$env/dynamic/private'

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
  baseUrl: env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

## 6. Query and render content

Fetch content on the server in `src/routes/+page.server.ts`:

```typescript
// src/routes/+page.server.ts
import { beech } from '$lib/server/beech'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
  const result = await beech.content('articles').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  return {
    articles: result.data ? result.data.data : []
  }
}
```

Render the loaded data in `src/routes/+page.svelte` using `renderRichText`:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types'
  import { renderRichText } from '@beechcms/client/richtext'

  let { data }: { data: PageData } = $props()
</script>

<main style="max-width: 800px; margin: 0 auto; padding: 2rem; font-family: sans-serif;">
  <h1>BeechCMS + SvelteKit</h1>

  {#if data.articles.length === 0}
    <p>No articles found. Plant an article in the BeechCMS dashboard!</p>
  {:else}
    <div style="display: grid; gap: 1.5rem;">
      {#each data.articles as article}
        <article style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem;">
          {#if article.cover_image}
            <img src={article.cover_image} alt={article.title} style="max-width: 100%; border-radius: 4px;" />
          {/if}
          <h2 style="margin-top: 0.5rem;">{article.title}</h2>
          <div>{@html renderRichText(article.body)}</div>
          <a href={`/articles/${article.slug}`}>Read article →</a>
        </article>
      {/each}
    </div>
  {/if}
</main>
```

## 7. Start the app

Run the SvelteKit development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You will see your BeechCMS content rendered on screen.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Ensure your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `BEECH_READ_KEY` to your `PUBLIC_READ_API_KEY`.
- **Private Module Isolation**: Placing client logic in `$lib/server` guarantees SvelteKit prevents sensitive code or tokens from ever leaking into client bundles.

## Cloudflare Edge Deployment

When deploying SvelteKit to Cloudflare Pages:

- **Cloudflare Adapter**: Install the official adapter:
  ```bash
  npm i -D @sveltejs/adapter-cloudflare
  ```
  Update `svelte.config.js`:
  ```javascript
  import adapter from '@sveltejs/adapter-cloudflare'
  export default {
    kit: { adapter: adapter() }
  }
  ```
- **Accessing Edge Platform Bindings**: Access Cloudflare environment variables directly inside server load functions via `platform.env`:
  ```typescript
  export const load: PageServerLoad = async ({ platform }) => {
    const apiUrl = platform?.env.BEECH_API_URL
    // ...
  }
  ```
- **Selective Prerendering**: Add `export const prerender = true` to marketing or documentation pages to compile them into zero-latency static CDN assets.

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
