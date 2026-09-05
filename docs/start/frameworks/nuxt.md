# Integrate BeechCMS with Nuxt 3

Deliver blazing fast SSR and universal hydration by pairing BeechCMS with Nuxt 3 and `@beechcms/client`.

<LlmPromptNode
  framework="Nuxt"
  title="Nuxt 3 Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Nuxt 3 integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your Nuxt project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client Plugin

Create a Nuxt plugin in `plugins/beech.ts` to inject the client into your app context:

```typescript
// plugins/beech.ts
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

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const client = createBeechServerClient<AppRegistry>({
    baseUrl: config.public.beechApiUrl || 'http://localhost:8789',
    apiKey: config.public.beechReadKey || 'dev-read-key-changeme'
  })

  return {
    provide: {
      beech: client
    }
  }
})
```

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

## Step 3: Fetching Content with `useAsyncData`

Fetch content on the server with seamless client hydration:

```vue
<!-- pages/posts/index.vue -->
<script setup lang="ts">
import type { Post } from '~/plugins/beech'

const { $beech } = useNuxtApp()

const { data: posts, pending, error } = await useAsyncData('posts', async () => {
  const result = await $beech.content('posts').list({
    sort: { created_at: 'desc' },
    limit: 12
  })
  return result.data ? result.data.data : []
})
</script>

<template>
  <main class="container">
    <h1>All Posts</h1>

    <div v-if="pending">Loading articles...</div>
    <div v-else-if="error">Error loading articles.</div>
    <div v-else class="grid">
      <article v-for="post in posts" :key="post.id" class="card">
        <img v-if="post.cover_image" :src="post.cover_image" :alt="post.title" />
        <h2>{{ post.title }}</h2>
        <NuxtLink :to="`/posts/${post.slug}`">Read More →</NuxtLink>
      </article>
    </div>
  </main>
</template>
```

## Step 4: Dynamic Post Route with SSR and RichText

Query single entries using `beech.content('posts').get({ slug })` and render TipTap body with `renderRichText`:

```vue
<!-- pages/posts/[slug].vue -->
<script setup lang="ts">
import type { Post } from '~/plugins/beech'
import { renderRichText } from '@beechcms/client/richtext'

const route = useRoute()
const { $beech } = useNuxtApp()

const { data: post } = await useAsyncData(`post-${route.params.slug}`, async () => {
  const result = await $beech.content('posts').get({
    slug: route.params.slug as string
  })
  return result.data ? result.data.data : null
})

if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: 'Post Not Found' })
}

useHead({
  title: post.value.title
})
</script>

<template>
  <article v-if="post" class="post-detail">
    <h1>{{ post.title }}</h1>
    <img v-if="post.cover_image" :src="post.cover_image" :alt="post.title" />
    <div v-html="renderRichText(post.body)" />
  </article>
</template>
```
