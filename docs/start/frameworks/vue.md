# Integrate BeechCMS with Vue 3

Connect your Vue 3 application (Vite or Vue CLI) to BeechCMS using the Composition API and `@beechcms/client`.

<LlmPromptNode
  framework="Vue"
  title="Vue 3 Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Vue 3 integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` in your Vue project:

<PackageManagerTabs command="@beechcms/client" />

## Step 2: Initialize Beech Client

Create a shared client in `src/lib/beech.ts` using `createBeechBrowserClient`:

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

## Step 3: Idiomatic Vue 3 Composition API

Fetch and render entries using `<script setup lang="ts">`, `ref`, `onMounted`, and `renderRichText`:

```vue
<!-- src/components/PostList.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { beech, type Post } from '../lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

const posts = ref<Post[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    loading.value = true
    const result = await beech.content('posts').list({
      sort: { created_at: 'desc' },
      limit: 12
    })

    if (result.error) {
      error.value = result.error.detail || 'Failed to load posts'
    } else if (result.data) {
      posts.value = result.data.data
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Network error'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="posts-container">
    <p v-if="loading">Loading posts...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <div v-else class="grid">
      <article v-for="post in posts" :key="post.id" class="post-card">
        <img v-if="post.cover_image" :src="post.cover_image" :alt="post.title" />
        <h2>{{ post.title }}</h2>
        <div v-html="renderRichText(post.body)" class="content-body" />
        <router-link :to="`/posts/${post.slug}`">Read Post →</router-link>
      </article>
    </div>
  </div>
</template>
```
