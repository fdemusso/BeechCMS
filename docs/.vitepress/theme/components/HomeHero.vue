<script setup lang="ts">
import { ref, computed } from 'vue'
import { withBase } from 'vitepress'

type TabType = 'ai' | 'cli'
const activeTab = ref<TabType>('ai')
const copied = ref(false)

const aiPromptText = `Help me get set up with BeechCMS. Do the following: 1. Scaffold a new project with npx @beechcms/cms my-app (or npx @beechcms/cms my-app --yes). 2. Review project structure (worker.ts, wrangler.jsonc, .dev.vars) and verify Cloudflare bindings. 3. Initialize the local database with npx beech onboard (or npm run db:migrate:local). 4. Connect @beechcms/client to Cloudflare Workers and D1 SQLite. 5. Suggest the most relevant next steps.`

const cliText = `npx @beechcms/cms my-app`

const activeTextToCopy = computed(() => {
  return activeTab.value === 'ai' ? aiPromptText : cliText
})

async function copyContent() {
  try {
    await navigator.clipboard.writeText(activeTextToCopy.value)
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
  <section class="home-hero-container">
    <div class="home-hero-grid">
      <!-- Left: 60% Colonna Testo con Icona -->
      <div class="hero-left">
        <div class="hero-text-row">
          <!-- Colonna 20%: Icona -->
          <div class="hero-icon-col">
            <img :src="withBase('/images/LightBeech.svg')" alt="BeechCMS" class="hero-logo-img logo-light" />
            <img :src="withBase('/images/DarkBeech.svg')" alt="BeechCMS" class="hero-logo-img logo-dark" />
          </div>

          <!-- Colonna 80%: Testo (diviso in 2 righe: H1 e Descrizione) -->
          <div class="hero-text-col">
            <h1 class="hero-title">
              BeechCMS Documentation
            </h1>
            <p class="hero-subtitle">
              Learn how to get up and running with BeechCMS through tutorials, APIs and platform resources.
            </p>
          </div>
        </div>
      </div>

      <!-- Right: AI Prompt & CLI Card (Supabase style) -->
      <div class="hero-right">
        <div class="hero-card">
          <div class="card-header">
            <div class="card-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                :aria-selected="activeTab === 'ai'"
                :class="['card-tab', { active: activeTab === 'ai' }]"
                @click="activeTab = 'ai'"
              >
                <svg class="tab-icon sparkle-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                </svg>
                <span>AI Prompt</span>
              </button>

              <button
                type="button"
                role="tab"
                :aria-selected="activeTab === 'cli'"
                :class="['card-tab', { active: activeTab === 'cli' }]"
                @click="activeTab = 'cli'"
              >
                <span class="tab-icon cli-symbol">&gt;_</span>
                <span>CLI</span>
              </button>
            </div>

            <button
              type="button"
              class="card-copy-btn"
              :class="{ copied }"
              :title="copied ? 'Copied!' : 'Copy to clipboard'"
              @click="copyContent"
            >
              <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
          </div>

          <div class="card-body">
            <div v-show="activeTab === 'ai'" class="prompt-text">
              Help me get set up with BeechCMS. Do the following: 1. Scaffold a new project with <code class="code-badge">npx @beechcms/cms my-app</code> (or <code class="code-badge">npx @beechcms/cms my-app --yes</code>). 2. Review project structure and verify that <code class="code-badge">.dev.vars</code> and <code class="code-badge">wrangler.jsonc</code> are configured. 3. Initialize the database with <code class="code-badge">npx beech onboard</code>. 4. Connect <code class="code-badge">@beechcms/client</code> to Cloudflare Workers and D1 SQLite. 5. Suggest the most relevant next steps.
            </div>

            <div v-show="activeTab === 'cli'" class="cli-text">
              <pre><code><span class="cmd-prompt">$</span> npx @beechcms/cms my-app</code></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-hero-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 48px 0 24px 0;
}

.home-hero-grid {
  display: grid;
  grid-template-columns: 60fr 40fr;
  gap: 48px;
  align-items: center;
}

/* Colonna 60% Sinistra */
.hero-left {
  width: 100%;
}

/* Riga 1: Testo (20% icona, 80% testo) */
.hero-text-row {
  display: grid;
  grid-template-columns: 20% 1fr;
  gap: 20px;
  align-items: center;
}

/* Colonna 20%: Icona */
.hero-icon-col {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.hero-logo-img {
  width: 100%;
  height: auto;
  max-width: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 16px rgba(255, 101, 132, 0.15));
}

.logo-light {
  display: block;
}

.logo-dark {
  display: none;
}

:root.dark .logo-light,
html.dark .logo-light,
.dark .logo-light {
  display: none !important;
}

:root.dark .logo-dark,
html.dark .logo-dark,
.dark .logo-dark {
  display: block !important;
}

/* Colonna 80%: Testo (diviso in 2 righe: H1 e Descrizione) */
.hero-text-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-title {
  font-family: var(--vp-font-family-heading) !important;
  font-size: 2.35rem !important;
  font-weight: 700 !important;
  line-height: 1.18 !important;
  letter-spacing: -0.02em !important;
  color: var(--vp-c-text-1) !important;
  margin: 0 !important;
}

.hero-subtitle {
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0 !important;
}

/* Right Column (Supabase-style card) */
.hero-right {
  display: flex;
  justify-content: center;
  width: 100%;
}

.hero-card {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-elv);
  overflow: hidden;
  box-shadow: var(--vp-shadow-2);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
}

.card-tabs {
  display: flex;
  gap: 8px;
}

.card-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--vp-c-text-3);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-tab:hover {
  color: var(--vp-c-text-1);
}

.card-tab.active {
  color: var(--vp-c-text-1);
  border-bottom-color: var(--vp-c-brand-1);
  font-weight: 600;
}

.card-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--vp-c-text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-copy-btn:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-border);
}

.card-copy-btn.copied {
  color: #10b981;
}

.card-body {
  padding: 20px;
  background: var(--vp-c-bg-alt);
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.prompt-text {
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-base);
}

.code-badge {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255, 101, 132, 0.1);
  color: var(--vp-c-brand-1) !important;
  border: 1px solid rgba(255, 101, 132, 0.2);
  word-break: break-all;
}

.dark .code-badge {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fbfbfe !important;
}

.cli-text {
  width: 100%;
}

.cli-text pre {
  margin: 0;
  padding: 0;
  background: transparent !important;
  font-family: var(--vp-font-family-mono);
  font-size: 0.92rem;
  line-height: 1.6;
}

.cli-text code {
  color: var(--vp-c-text-1) !important;
  background: transparent !important;
  font-weight: 500;
}

.cmd-prompt {
  user-select: none;
  color: var(--vp-c-brand-1);
  margin-right: 10px;
  font-weight: 600;
}

@media (max-width: 960px) {
  .home-hero-grid {
    grid-template-columns: 1fr;
    gap: 36px;
  }

  .hero-title {
    font-size: 2.1rem !important;
  }
}

@media (max-width: 640px) {
  .hero-text-row {
    grid-template-columns: 60px 1fr;
    gap: 16px;
  }

  .hero-logo-img {
    width: 100%;
    height: auto;
  }

  .hero-title {
    font-size: 1.75rem !important;
  }
}
</style>
