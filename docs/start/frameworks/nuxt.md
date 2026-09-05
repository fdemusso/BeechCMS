# Integrate BeechCMS with Nuxt 3

Deliver blazing fast SSR and universal hydration by pairing BeechCMS with Nuxt 3 and `@beechcms/client`.

<LlmPromptNode
  framework="Nuxt"
  title="Nuxt 3 Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Nuxt 3 integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in Nuxt, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a Nuxt app

Create a new Nuxt 3 project using the official CLI:

```bash
npx nuxi@latest init my-nuxt-app
cd my-nuxt-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your Nuxt project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Add your configuration in `nuxt.config.ts`:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      beechApiUrl: process.env.BEECH_API_URL || 'http://localhost:8789',
      beechReadKey: process.env.BEECH_READ_KEY || 'dev-read-key-changeme'
    }
  }
})
```

Create a `.env` file in your Nuxt project root:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

## 5. Initialize the Beech client plugin

Create a Nuxt plugin in `plugins/beech.ts` to provide the typed server client to the universal Nuxt context:

```typescript
// plugins/beech.ts
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

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const client = createBeechServerClient<AppRegistry>({
    baseUrl: config.public.beechApiUrl,
    apiKey: config.public.beechReadKey
  })

  return {
    provide: {
      beech: client
    }
  }
})
```

## 6. Query and render content

Replace `app.vue` (or `pages/index.vue` if using the pages directory) with a universal component utilizing `useAsyncData` and `renderRichText`:

```vue
<!-- app.vue -->
<script setup lang="ts">
import { renderRichText } from '@beechcms/client/richtext'

const { $beech } = useNuxtApp()

const { data: articles, pending, error } = await useAsyncData('articles', async () => {
  const result = await $beech.content('articles').list({
    sort: { created_at: 'desc' },
    limit: 10
  })
  return result.data ? result.data.data : []
})
</script>

<template>
  <main style="max-width: 800px; margin: 0 auto; padding: 2rem; font-family: sans-serif;">
    <h1>BeechCMS + Nuxt 3</h1>

    <div v-if="pending">Loading articles...</div>
    <div v-else-if="error" style="color: #ef4444;">Failed to load articles.</div>
    <div v-else-if="!articles || articles.length === 0">
      No articles found. Publish an article in the BeechCMS dashboard!
    </div>

    <div v-else style="display: grid; gap: 1.5rem;">
      <article
        v-for="article in articles"
        :key="article.id"
        style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem;"
      >
        <img
          v-if="article.cover_image"
          :src="article.cover_image"
          :alt="article.title"
          style="max-width: 100%; border-radius: 4px;"
        />
        <h2 style="margin-top: 0.5rem;">{{ article.title }}</h2>
        <div v-html="renderRichText(article.body)" />
      </article>
    </div>
  </main>
</template>
```

## 7. Start the app

Run the Nuxt development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You will see your BeechCMS articles hydrated universally on screen.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Ensure your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `BEECH_READ_KEY` to your `PUBLIC_READ_API_KEY`.
- **Hydration & SSR**: `useAsyncData` serializes payloads during server-side rendering and avoids duplicate requests during client hydration.

## Cloudflare Edge Deployment

When deploying Nuxt 3 to Cloudflare Pages:

- **Built-in Nitro Preset**: Nuxt includes native Cloudflare support via Nitro with zero additional packages. Set the build preset:
  ```bash
  NITRO_PRESET=cloudflare-pages npm run build
  ```
- **Node.js Compatibility**: Ensure `compatibility_flags = ["nodejs_compat"]` is enabled in your Cloudflare Pages project settings.
- **Edge Caching via `routeRules`**: Cache rendered BeechCMS content directly at Cloudflare's edge with stale-while-revalidate behavior:
  ```typescript
  // nuxt.config.ts
  export default defineNuxtConfig({
    routeRules: {
      '/articles/**': { isr: 60 } // Cache at the edge for 60 seconds
    }
  })
  ```

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
