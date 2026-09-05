<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const props = withDefaults(
  defineProps<{
    prompt?: string
    framework?: string
    title?: string
    description?: string
  }>(),
  {
    title: 'AI Quickstart Prompt',
    description: 'Copy this prompt into Cursor, Claude, or ChatGPT to generate integration code:'
  }
)

const { site } = useData()
const copied = ref(false)

const docBaseUrl = computed(() => {
  if (typeof window !== 'undefined' && window.location.origin) {
    const base = site.value.base || '/'
    const cleanBase = base.endsWith('/') ? base : `${base}/`
    return `${window.location.origin}${cleanBase}`
  }
  return 'https://flaviodemusso.github.io/BeechCMS/'
})

const defaultPrompt = computed(() => {
  const fw = props.framework ? ` a ${props.framework}` : ' your web'
  return `You are an expert full-stack developer integrating BeechCMS into${fw} application.
BeechCMS is an edge-native headless CMS built on Cloudflare Workers, D1, and R2.

Documentation Base: ${docBaseUrl.value}
Official Client SDK: @beechcms/client
Forms SDK: @beechcms/forms-react
Search Client: @beechcms/search-client

Key Architecture Guidelines:
- Edge Native: Sub-millisecond latency on Cloudflare edge.
- Client SDK: Use createBeechBrowserClient / createBeechServerClient from '@beechcms/client/browser' or '@beechcms/client/server' with baseUrl and apiKey.
- Content Querying: Use beech.content('seedSlug').list({ sort: { created_at: 'desc' }, limit: 10 }) or beech.content('seedSlug').get({ slug }).
- Result Unwrapping: Extract records from result.data.data and handle errors via result.error.
- RichText: Render TipTap body AST via renderRichText(post.body) from '@beechcms/client/richtext'.
- Content Models: Seeds define schemas, Branches define fields, Fruits represent content items.
- Dual-Table Mirror Staging: Drafts stay isolated in draft staging tables and promote atomically to production.

Generate the integration code following strict TypeScript typing, clean error handling, and modern edge-rendering patterns.`
})

const resolvedPrompt = computed(() => {
  if (props.prompt) {
    return props.prompt.replace(/\$\{DOCS_URL\}/g, docBaseUrl.value)
  }
  return defaultPrompt.value
})

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(resolvedPrompt.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Fallback
  }
}
</script>

<template>
  <div class="llm-prompt-node">
    <div class="llm-header">
      <div class="llm-meta">
        <div class="llm-badge">
          <svg class="sparkle-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
          <span>{{ title }}</span>
        </div>
        <p class="llm-desc">{{ description }}</p>
      </div>

      <button
        type="button"
        class="llm-copy-btn"
        :class="{ copied }"
        @click="copyPrompt"
      >
        <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>{{ copied ? 'Copied to Clipboard!' : 'Copy Prompt' }}</span>
      </button>
    </div>

    <div class="llm-body">
      <pre><code>{{ resolvedPrompt }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.llm-prompt-node {
  margin: 18px 0;
  border-radius: 10px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-elv);
  overflow: hidden;
  box-shadow: var(--vp-shadow-1);
}

.llm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
  flex-wrap: wrap;
}

.llm-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.llm-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sparkle-icon {
  color: var(--vp-c-brand-1);
}

.llm-desc {
  margin: 0 !important;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.llm-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.llm-copy-btn:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.llm-copy-btn.copied {
  color: #10b981;
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.llm-body {
  padding: 16px;
  background: var(--vp-c-bg-alt);
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.86rem;
  line-height: 1.6;
}

.llm-body pre {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: transparent;
}

.llm-body code {
  color: var(--vp-c-text-1) !important;
  background: transparent !important;
  padding: 0 !important;
}
</style>
