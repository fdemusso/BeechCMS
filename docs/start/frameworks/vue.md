# Integrate BeechCMS with Vue 3

Connect your Vue 3 application (Vite or Vue CLI) to BeechCMS using the Composition API and `@beechcms/client`.

<LlmPromptNode
  framework="Vue"
  title="Vue 3 Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Vue 3 integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in Vue, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a Vue app

Create a new Vue 3 project with TypeScript using the [Vite](https://vitejs.dev/) template:

```bash
npm create vite@latest my-vue-app -- --template vue-ts
cd my-vue-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your Vue project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Create a `.env.local` file in your Vue project root:

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

Replace the contents of `src/App.vue` with an idiomatic Composition API component that fetches articles and renders TipTap rich text via `renderRichText`:

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { beech, type Article } from './lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

const articles = ref<Article[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    loading.value = true
    const result = await beech.content('articles').list({
      sort: { created_at: 'desc' },
      limit: 10
    })

    if (result.error) {
      error.value = result.error.detail || 'Failed to load articles'
    } else if (result.data) {
      articles.value = result.data.data
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Network error'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="container">
    <h1>BeechCMS + Vue 3</h1>

    <div v-if="loading" class="notice">Loading articles...</div>
    <div v-else-if="error" class="notice error">Error: {{ error }}</div>
    <div v-else-if="articles.length === 0" class="notice">
      No articles found. Publish an article in the BeechCMS dashboard!
    </div>

    <div v-else class="grid">
      <article v-for="article in articles" :key="article.id" class="card">
        <img v-if="article.cover_image" :src="article.cover_image" :alt="article.title" />
        <h2>{{ article.title }}</h2>
        <div v-html="renderRichText(article.body)" class="body-content" />
      </article>
    </div>
  </main>
</template>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: sans-serif;
}
.notice {
  padding: 1rem 0;
}
.notice.error {
  color: #ef4444;
}
.grid {
  display: grid;
  gap: 1.5rem;
}
.card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
}
.card img {
  max-width: 100%;
  border-radius: 4px;
}
</style>
```

## 7. Start the app

Run the Vite development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You will see your BeechCMS articles rendered reactively on screen.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Verify that your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `VITE_BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `VITE_BEECH_READ_KEY` to the `PUBLIC_READ_API_KEY` defined in your Cloudflare Worker environment.
- **Client Security**: Notice that `@beechcms/client/browser` is physically read-only. Mutation methods (`create`, `update`, `delete`) are omitted from browser bundles to keep administrative credentials secure.

## Cloudflare Edge Deployment

When deploying your Vue 3 SPA to Cloudflare Pages:

- **Zero-Cost Static Hosting**: Run `npm run build` to compile into static assets (`dist/`). In Cloudflare Pages, connect your repository with build command `npm run build` and output directory `dist` to host your application on Cloudflare's global edge network at zero compute cost.
- **SPA History Mode Routing (`_redirects`)**: To support HTML5 History Mode without 404 errors when visitors refresh deep URLs, create a `public/_redirects` file:
  ```text
  /*    /index.html   200
  ```
- **CORS Configuration**: Add your Pages URL (e.g. `https://my-vue-app.pages.dev`) to `CORS_ORIGINS` in your BeechCMS Cloudflare Worker bindings.

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
