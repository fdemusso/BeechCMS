<script setup lang="ts">
import { withBase } from 'vitepress'
import ReIcon from './ReIcon.vue'

interface BentoFeature {
  title: string
  badge: string
  link: string
  description: string
  span: 1 | 2 | 3
  icon: string
  previewType:
    | 'media-flow'
    | 'version-diff'
    | 'backref-graph'
    | 'tiptap-toolbar'
    | 'command-spotlight'
    | 'kanban-board'
    | 'email-dispatch'
    | 'forms-radar'
    | 'automations-flow'
    | 'queue-logs'
    | 'vector-search'
    | 'edge-telemetry'
    | 'confidential-vault'
    | 'webhook-inspector'
}

interface BentoSection {
  id: string
  title: string
  description: string
  accent: 'emerald' | 'indigo' | 'amber'
  features: BentoFeature[]
}

const sections: BentoSection[] = [
  {
    id: 'content-media',
    title: 'Content & Media Engine',
    description: 'Edge-native asset storage, transactional versioning, and high-fidelity editorial ASTs.',
    accent: 'emerald',
    features: [
      {
        title: 'Direct-to-R2 Media Engine',
        badge: 'Edge Storage',
        link: '/features/media-engine',
        description: 'Stream media directly to Cloudflare R2 storage via AWS SigV4 presigned URLs. Zero Worker memory footprint with CDN-cached global delivery.',
        span: 2,
        icon: 'cloud-upload',
        previewType: 'media-flow'
      },
      {
        title: 'Drafts & Versioning',
        badge: 'Lifecycle',
        link: '/features/drafts',
        description: 'Staged draft workflows, schema-validated partial updates, visual diff comparisons, and atomic live swaps.',
        span: 1,
        icon: 'git-branch',
        previewType: 'version-diff'
      },
      {
        title: 'Bidirectional Backrefs',
        badge: 'Relational Graph',
        link: '/features/backrefs',
        description: 'Graph-aware relational tracking with automatic inbound reference lookups and cascade deletion guards.',
        span: 1,
        icon: 'network',
        previewType: 'backref-graph'
      },
      {
        title: 'TipTap Rich Text Engine',
        badge: 'Editorial AST',
        link: '/features/richtext-editor',
        description: 'Structured ProseMirror JSON AST output, inline drag-and-drop media uploads, automated orphan cleanup, and strict sanitization.',
        span: 2,
        icon: 'pen-tool',
        previewType: 'tiptap-toolbar'
      }
    ]
  },
  {
    id: 'editorial-productivity',
    title: 'Editorial Experience & Productivity',
    description: 'Keyboard-first navigation, polymorphic editorial perspectives, and enterprise form defenses.',
    accent: 'indigo',
    features: [
      {
        title: 'Command Palette (Cmd+K)',
        badge: 'Keyboard-First',
        link: '/features/command-palette',
        description: 'Instant spotlight navigation, fuzzy seed filtering, deep record lookup, and rapid actions right from the keyboard.',
        span: 1,
        icon: 'command',
        previewType: 'command-spotlight'
      },
      {
        title: 'Editorial Views: Kanban & Gallery',
        badge: 'Dashboard UI',
        link: '/features/editorial-views',
        description: 'Multi-perspective content management with drag-and-drop status boards, visual asset galleries, and transactional multi-step bulk edits.',
        span: 2,
        icon: 'layout-kanban',
        previewType: 'kanban-board'
      },
      {
        title: 'Email Module',
        badge: 'Notifications',
        link: '/features/email-module',
        description: 'Decoupled transactional email delivery and templating with native Resend support and custom SMTP adapters.',
        span: 1,
        icon: 'mail',
        previewType: 'email-dispatch'
      },
      {
        title: 'Forms SDK & Anti-Bot',
        badge: 'Lead Capture',
        link: '/features/forms',
        description: 'Zero-secret public submissions protected with cryptographic Time-Trap tokens and Honeypot defenses.',
        span: 2,
        icon: 'shield-check',
        previewType: 'forms-radar'
      }
    ]
  },
  {
    id: 'security-infrastructure',
    title: 'Security, Workflows & Integrations',
    description: 'Event-driven background orchestration, GDPR field cryptography, and edge vector intelligence.',
    accent: 'amber',
    features: [
      {
        title: 'Automations Engine',
        badge: 'Event-Driven',
        link: '/features/automations',
        description: 'Trigger automated workflows, webhooks, and transactional notifications on content lifecycle events or scheduled cron intervals.',
        span: 2,
        icon: 'zap',
        previewType: 'automations-flow'
      },
      {
        title: 'Observability & Queues',
        badge: 'Reliability',
        link: '/features/observability',
        description: 'Asynchronous job queues powered by Upstash QStash and immutable Cloudflare D1 activity audit logs.',
        span: 1,
        icon: 'activity',
        previewType: 'queue-logs'
      },
      {
        title: 'Search SDK & Embeddings',
        badge: 'Hybrid Search',
        link: '/features/search',
        description: 'Edge-native vector semantic search and full-text hybrid querying powered by @beechcms/search-client.',
        span: 1,
        icon: 'search',
        previewType: 'vector-search'
      },
      {
        title: 'Edge Analytics',
        badge: 'Telemetry',
        link: '/features/analytics',
        description: 'Non-blocking edge request telemetry, per-Seed traffic breakdowns, storage quotas, and unused media detection.',
        span: 1,
        icon: 'bar-chart',
        previewType: 'edge-telemetry'
      },
      {
        title: 'Confidential Data & Lifecycle',
        badge: 'Cryptography',
        link: '/features/confidential-data',
        description: 'GDPR-compliant field policies, salted hashes, and cryptographic key rotation without database downtime or table locks.',
        span: 1,
        icon: 'lock',
        previewType: 'confidential-vault'
      },
      {
        title: 'Webhooks & Event Delivery',
        badge: 'Realtime Dispatch',
        link: '/features/webhooks',
        description: 'HMAC-SHA256 signed outbound event dispatching for Next.js on-demand ISR revalidation, Jamstack rebuilds, and microservice synchronization.',
        span: 3,
        icon: 'webhook',
        previewType: 'webhook-inspector'
      }
    ]
  }
]
</script>

<template>
  <div class="features-bento-wrapper">
    <div
      v-for="section in sections"
      :key="section.id"
      class="bento-section-group"
      :class="`accent-${section.accent}`"
    >
      <!-- Section Header -->
      <div class="bento-section-header">
        <h2 :id="section.id">{{ section.title }}</h2>
        <p class="bento-section-desc">{{ section.description }}</p>
      </div>

      <!-- Asymmetric Bento Grid -->
      <div class="bento-grid" :class="`bento-layout-${section.id}`">
        <a
          v-for="feature in section.features"
          :key="feature.title"
          :href="withBase(feature.link)"
          class="bento-card"
          :class="[
            `bento-span-${feature.span}`,
            `preview-${feature.previewType}`
          ]"
        >
          <!-- Card Top Bar: Icon + Badge + Arrow -->
          <div class="bento-card-top">
            <div class="bento-card-meta">
              <div class="feature-icon-wrapper">
                <!-- SVG Icons -->
                <svg v-if="feature.icon === 'cloud-upload'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                  <path d="M12 12v9"/>
                  <path d="m16 16-4-4-4 4"/>
                </svg>
                <svg v-else-if="feature.icon === 'git-branch'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15"/>
                  <circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
                <svg v-else-if="feature.icon === 'network'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="16" y="16" width="6" height="6" rx="1"/>
                  <rect x="2" y="16" width="6" height="6" rx="1"/>
                  <rect x="9" y="2" width="6" height="6" rx="1"/>
                  <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                  <path d="M12 12V8"/>
                </svg>
                <svg v-else-if="feature.icon === 'pen-tool'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m12 19 7-7 3 3-7 7-3-3z"/>
                  <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  <path d="m2 2 7.586 7.586"/>
                  <circle cx="11" cy="11" r="2"/>
                </svg>
                <svg v-else-if="feature.icon === 'command'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3z"/>
                </svg>
                <svg v-else-if="feature.icon === 'layout-kanban'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2"/>
                  <path d="M8 7v7"/>
                  <path d="M12 7v4"/>
                  <path d="M16 7v9"/>
                </svg>
                <svg v-else-if="feature.icon === 'mail'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <svg v-else-if="feature.icon === 'shield-check'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
                <svg v-else-if="feature.icon === 'zap'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <svg v-else-if="feature.icon === 'activity'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <svg v-else-if="feature.icon === 'search'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <svg v-else-if="feature.icon === 'bar-chart'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="20" x2="12" y2="10"/>
                  <line x1="18" y1="20" x2="18" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="16"/>
                </svg>
                <svg v-else-if="feature.icon === 'lock'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <svg v-else-if="feature.icon === 'webhook'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/>
                  <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1A4 4 0 1 1 14 7c0 .7-.2 1.4-.57 2L10.3 14.78"/>
                  <circle cx="18" cy="17" r="3"/>
                </svg>
              </div>
              <span class="bento-badge">{{ feature.badge }}</span>
            </div>
            <div class="bento-arrow">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"/>
                <polyline points="7 7 17 7 17 17"/>
              </svg>
            </div>
          </div>

          <!-- Card Content -->
          <div class="bento-card-body">
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </div>

          <!-- BESPOKE VISUAL MICRO-PREVIEWS -->
          <div class="bento-visual-preview">
            <!-- 1. Media Flow -->
            <div v-if="feature.previewType === 'media-flow'" class="preview-media-pipeline">
              <div class="pipeline-step client-step">
                <ReIcon name="folder" :size="15" class="step-icon" />
                <span class="step-name">hero.webp</span>
                <span class="step-size">2.4 MB</span>
              </div>
              <div class="pipeline-connector">
                <span class="conn-pill">SigV4 Presigned</span>
                <ReIcon name="arrow-right" :size="13" class="conn-arrow" />
              </div>
              <div class="pipeline-step r2-step">
                <span class="r2-badge">R2 / S3</span>
                <span class="r2-edge">Zero RAM</span>
              </div>
            </div>

            <!-- 2. Version Diff -->
            <div v-else-if="feature.previewType === 'version-diff'" class="preview-version-diff">
              <div class="diff-node live">
                <span class="diff-dot green"></span>
                <span class="diff-label">v1.4 Live</span>
              </div>
              <span class="diff-arrow"><ReIcon name="swap" :size="14" /></span>
              <div class="diff-node draft">
                <span class="diff-dot amber"></span>
                <span class="diff-label">v2.0 Staged</span>
                <span class="diff-tag">+3 fields</span>
              </div>
            </div>

            <!-- 3. Backref Graph -->
            <div v-else-if="feature.previewType === 'backref-graph'" class="preview-backref-graph">
              <div class="graph-pill">Articles</div>
              <div class="graph-link">
                <span class="link-line"></span>
                <span class="link-badge">14 Inbound</span>
              </div>
              <div class="graph-pill target">Authors</div>
            </div>

            <!-- 4. TipTap Toolbar -->
            <div v-else-if="feature.previewType === 'tiptap-toolbar'" class="preview-tiptap-box">
              <div class="tiptap-toolbar">
                <span class="tool-btn active">B</span>
                <span class="tool-btn">I</span>
                <span class="tool-btn">H2</span>
                <span class="tool-btn quote">“</span>
                <span class="tool-btn">&lt;/&gt;</span>
                <span class="tool-btn icon-tool-btn"><ReIcon name="link" :size="13" /></span>
                <span class="tool-ast-tag">ProseMirror JSON</span>
              </div>
              <div class="tiptap-mock-line">
                <span class="line-lead">Rich text block with zero-leak</span>
                <span class="line-badge">Clean AST</span>
              </div>
            </div>

            <!-- 5. Command Spotlight -->
            <div v-else-if="feature.previewType === 'command-spotlight'" class="preview-command-bar">
              <div class="cmd-input">
                <span class="cmd-icon"><ReIcon name="command" :size="13" /></span>
                <span class="cmd-placeholder">Search seeds & actions...</span>
                <span class="cmd-shortcut">⌘K</span>
              </div>
              <div class="cmd-result">
                <span class="cmd-bullet"><ReIcon name="chevron-right" :size="12" /></span>
                <span class="cmd-target">Media Gallery</span>
                <span class="cmd-enter"><ReIcon name="enter" :size="12" /></span>
              </div>
            </div>

            <!-- 6. Kanban Board -->
            <div v-else-if="feature.previewType === 'kanban-board'" class="preview-kanban">
              <div class="kanban-col">
                <div class="col-head"><span class="col-dot gray"></span> Drafts (3)</div>
                <div class="kanban-item">Q3 Roadmap</div>
              </div>
              <div class="kanban-col">
                <div class="col-head"><span class="col-dot amber"></span> Review (1)</div>
                <div class="kanban-item active">Launch Post</div>
              </div>
              <div class="kanban-col">
                <div class="col-head"><span class="col-dot green"></span> Live (8)</div>
                <div class="kanban-item">Changelog</div>
              </div>
            </div>

            <!-- 7. Email Dispatch -->
            <div v-else-if="feature.previewType === 'email-dispatch'" class="preview-email">
              <div class="email-row">
                <span class="email-key">To:</span>
                <span class="email-val">editorial@beechcms.dev</span>
              </div>
              <div class="email-status">
                <span class="email-pill">Resend</span>
                <span class="email-check"><ReIcon name="check" :size="12" /> Delivered (52ms)</span>
              </div>
            </div>

            <!-- 8. Forms Radar -->
            <div v-else-if="feature.previewType === 'forms-radar'" class="preview-forms-defense">
              <div class="defense-item">
                <span class="defense-icon"><ReIcon name="shield" :size="14" /></span>
                <span class="defense-title">Time-Trap</span>
                <span class="defense-val">4.8s Valid</span>
              </div>
              <div class="defense-item">
                <span class="defense-icon"><ReIcon name="bug" :size="14" /></span>
                <span class="defense-title">Honeypot</span>
                <span class="defense-val">Armed</span>
              </div>
              <div class="defense-item">
                <span class="defense-icon"><ReIcon name="flash" :size="14" /></span>
                <span class="defense-title">Zero Secret</span>
                <span class="defense-val">SHA-256</span>
              </div>
            </div>

            <!-- 9. Automations Flow -->
            <div v-else-if="feature.previewType === 'automations-flow'" class="preview-automations">
              <div class="auto-node trigger">
                <span class="node-tag">on("publish")</span>
              </div>
              <span class="auto-arrow"><ReIcon name="arrow-right" :size="12" /></span>
              <div class="auto-node action">
                <span class="node-tag">dispatchWebhook()</span>
              </div>
              <span class="auto-arrow"><ReIcon name="arrow-right" :size="12" /></span>
              <div class="auto-node queue">
                <span class="node-tag">QStash Retry</span>
              </div>
            </div>

            <!-- 10. Queue Logs -->
            <div v-else-if="feature.previewType === 'queue-logs'" class="preview-queue">
              <div class="queue-row">
                <span class="queue-pulse"></span>
                <span class="queue-id">qstash_job_894</span>
                <span class="queue-ack">ACK 200</span>
              </div>
              <div class="queue-sub">Immutable D1 Audit Logged</div>
            </div>

            <!-- 11. Vector Search -->
            <div v-else-if="feature.previewType === 'vector-search'" class="preview-vector">
              <div class="vector-input">query: "edge-native d1"</div>
              <div class="vector-score">
                <span class="score-bar"><span class="score-fill"></span></span>
                <span class="score-num">0.962 match</span>
              </div>
            </div>

            <!-- 12. Edge Telemetry -->
            <div v-else-if="feature.previewType === 'edge-telemetry'" class="preview-telemetry">
              <div class="telemetry-stat">
                <span class="stat-num">14ms</span>
                <span class="stat-lbl">P95 Edge</span>
              </div>
              <div class="telemetry-sep"></div>
              <div class="telemetry-stat">
                <span class="stat-num">99.9%</span>
                <span class="stat-lbl">Cache Hit</span>
              </div>
            </div>

            <!-- 13. Confidential Vault -->
            <div v-else-if="feature.previewType === 'confidential-vault'" class="preview-vault">
              <div class="vault-chip">
                <span class="vault-cipher">AES-GCM-256</span>
                <span class="vault-key">key: ••••e8f2</span>
              </div>
              <div class="vault-status">Zero-downtime rotation</div>
            </div>

            <!-- 14. Webhook Inspector (Wide hero card) -->
            <div v-else-if="feature.previewType === 'webhook-inspector'" class="preview-webhook-wide">
              <div class="webhook-endpoint">
                <span class="method-post">POST</span>
                <span class="endpoint-url">https://frontend.domain/api/revalidate</span>
                <span class="response-badge">200 OK • 28ms</span>
              </div>
              <div class="webhook-headers">
                <span class="header-key">x-beech-signature:</span>
                <span class="header-val">sha256=9b7a42ec7f1b90d8...</span>
                <span class="verified-tag"><ReIcon name="check" :size="11" /> Verified</span>
              </div>
            </div>
          </div>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.features-bento-wrapper {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 64px;
}

/* ==========================================================================
   Section Headers & Accent Theming
   ========================================================================== */
.bento-section-group {
  position: relative;
}

.bento-section-header {
  margin-bottom: 24px;
}

.bento-section-header h2 {
  font-family: var(--vp-font-family-heading);
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0 0 6px 0 !important;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
  border-top: none !important;
  padding-top: 0 !important;
}

.bento-section-desc {
  font-size: 0.98rem;
  color: var(--vp-c-text-2);
  margin: 0 !important;
  line-height: 1.5;
}

/* Emerald Theme (Content & Media Engine) */
.accent-emerald {
  --sec-accent: #10b981;
  --sec-accent-soft: rgba(16, 185, 129, 0.12);
  --sec-border-hover: rgba(16, 185, 129, 0.35);
  --sec-glow: rgba(16, 185, 129, 0.08);
}

/* Indigo Theme (Editorial Experience & Productivity) */
.accent-indigo {
  --sec-accent: #8b5cf6;
  --sec-accent-soft: rgba(139, 92, 246, 0.12);
  --sec-border-hover: rgba(139, 92, 246, 0.35);
  --sec-glow: rgba(139, 92, 246, 0.08);
}

/* Amber Theme (Security, Workflows & Integrations) */
.accent-amber {
  --sec-accent: #f59e0b;
  --sec-accent-soft: rgba(245, 158, 11, 0.12);
  --sec-border-hover: rgba(245, 158, 11, 0.35);
  --sec-glow: rgba(245, 158, 11, 0.08);
}

/* ==========================================================================
   Bento Grid Layouts & Asymmetry
   ========================================================================== */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}

/* Bento Card Base */
.bento-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px;
  border-radius: 18px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-elv);
  text-decoration: none !important;
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: var(--vp-shadow-1);
  position: relative;
  overflow: hidden;
}

.bento-card:hover {
  border-color: var(--sec-accent);
  background: var(--vp-c-bg-alt);
  transform: translateY(-3px);
  box-shadow: 0 12px 32px -8px var(--sec-glow), 0 0 0 1px var(--sec-border-hover);
}

.bento-span-1 {
  grid-column: span 1;
}
.bento-span-2 {
  grid-column: span 2;
}
.bento-span-3 {
  grid-column: span 3;
}

/* Top Meta: Icon + Badge + Arrow */
.bento-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.bento-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feature-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--sec-accent-soft);
  color: var(--sec-accent);
  transition: transform 0.25s ease;
}

.bento-card:hover .feature-icon-wrapper {
  transform: scale(1.08);
}

.bento-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 9999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
}

.bento-arrow {
  color: var(--vp-c-text-3);
  opacity: 0.4;
  transition: all 0.25s ease;
  transform: translate(0, 0);
}

.bento-card:hover .bento-arrow {
  opacity: 1;
  color: var(--sec-accent);
  transform: translate(2px, -2px);
}

/* Card Body */
.bento-card-body h3 {
  margin: 0 0 8px 0 !important;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--vp-c-text-1) !important;
  line-height: 1.35;
}

.bento-card-body p {
  margin: 0 !important;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--vp-c-text-2) !important;
}

/* ==========================================================================
   Visual Micro-Previews (Rich & Diverse)
   ========================================================================== */
.bento-visual-preview {
  margin-top: 20px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  overflow: hidden;
}

/* 1. Media Pipeline */
.preview-media-pipeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.pipeline-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
}
.step-icon {
  display: inline-flex;
  align-items: center;
  color: var(--sec-accent);
}
.step-size {
  color: var(--vp-c-text-3);
  font-size: 0.72rem;
}
.pipeline-connector {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sec-accent);
}
.conn-pill {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--sec-accent-soft);
  font-weight: 500;
}
.r2-step {
  background: var(--sec-accent-soft);
  border-color: var(--sec-border-hover);
}
.r2-badge {
  font-weight: 600;
  color: var(--sec-accent);
}
.r2-edge {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

/* 2. Version Diff */
.preview-version-diff {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.diff-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
}
.diff-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.diff-dot.green { background: #10b981; box-shadow: 0 0 6px #10b981; }
.diff-dot.amber { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
.diff-tag {
  font-size: 0.68rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  padding: 1px 4px;
  border-radius: 4px;
}
.diff-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-text-3);
}

/* 3. Backref Graph */
.preview-backref-graph {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.graph-pill {
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  font-weight: 500;
}
.graph-pill.target {
  background: var(--sec-accent-soft);
  color: var(--sec-accent);
}
.graph-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.link-line {
  width: 32px;
  height: 1px;
  background: var(--sec-accent);
}
.link-badge {
  font-size: 0.68rem;
  color: var(--sec-accent);
}

/* 4. TipTap Toolbar */
.preview-tiptap-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tiptap-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
.tool-btn.active {
  background: var(--sec-accent);
  color: #ffffff;
  border-color: var(--sec-accent);
}
.tool-ast-tag {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--sec-accent);
  background: var(--sec-accent-soft);
  padding: 2px 6px;
  border-radius: 4px;
}
.tiptap-mock-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
}
.line-badge {
  font-size: 0.68rem;
  color: #10b981;
}

/* 5. Command Bar */
.preview-command-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cmd-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
}
.cmd-icon {
  display: inline-flex;
  align-items: center;
  color: var(--sec-accent);
}
.cmd-placeholder { color: var(--vp-c-text-3); font-size: 0.74rem; flex: 1; }
.cmd-shortcut {
  font-size: 0.68rem;
  background: var(--vp-c-bg-soft);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--vp-c-text-2);
}
.cmd-result {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--sec-accent);
  padding: 0 4px;
}
.cmd-bullet {
  display: inline-flex;
  align-items: center;
}
.cmd-enter {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  color: var(--vp-c-text-3);
}

/* 6. Kanban Board */
.preview-kanban {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.kanban-col {
  background: var(--vp-c-bg-elv);
  border-radius: 6px;
  padding: 6px;
  border: 1px solid var(--vp-c-divider);
}
.col-head {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin-bottom: 4px;
}
.col-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.col-dot.gray { background: #9ca3af; }
.col-dot.amber { background: #f59e0b; }
.col-dot.green { background: #10b981; }
.kanban-item {
  font-size: 0.7rem;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kanban-item.active {
  border-color: var(--sec-accent);
  color: var(--sec-accent);
  background: var(--sec-accent-soft);
}

/* 7. Email Dispatch */
.preview-email {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.email-row {
  display: flex;
  gap: 6px;
  font-size: 0.74rem;
}
.email-key { color: var(--vp-c-text-3); }
.email-val { color: var(--vp-c-text-1); font-weight: 500; }
.email-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.7rem;
}
.email-pill {
  background: var(--sec-accent-soft);
  color: var(--sec-accent);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.email-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
}

/* 8. Forms Defense */
.preview-forms-defense {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.defense-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
}
.defense-icon {
  display: inline-flex;
  align-items: center;
  color: var(--sec-accent);
  margin-bottom: 2px;
}
.defense-title {
  font-size: 0.68rem;
  color: var(--vp-c-text-3);
}
.defense-val {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--sec-accent);
}

/* 9. Automations Flow */
.preview-automations {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.auto-node {
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  font-size: 0.74rem;
}
.auto-node.trigger {
  color: #f59e0b;
}
.auto-node.action {
  color: var(--sec-accent);
  background: var(--sec-accent-soft);
}
.auto-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-text-3);
}

/* 10. Queue Logs */
.preview-queue {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.queue-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
}
.queue-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}
.queue-id { color: var(--vp-c-text-1); font-weight: 500; }
.queue-ack {
  margin-left: auto;
  font-size: 0.68rem;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 1px 4px;
  border-radius: 3px;
}
.queue-sub {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

/* 11. Vector Search */
.preview-vector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.vector-input {
  color: var(--vp-c-text-2);
  font-size: 0.74rem;
}
.vector-score {
  display: flex;
  align-items: center;
  gap: 8px;
}
.score-bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--vp-c-divider);
  overflow: hidden;
}
.score-fill {
  display: block;
  width: 96%;
  height: 100%;
  background: var(--sec-accent);
}
.score-num {
  font-size: 0.7rem;
  color: var(--sec-accent);
  font-weight: 600;
}

/* 12. Edge Telemetry */
.preview-telemetry {
  display: flex;
  align-items: center;
  justify-content: space-around;
}
.telemetry-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-num {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--sec-accent);
}
.stat-lbl {
  font-size: 0.68rem;
  color: var(--vp-c-text-3);
}
.telemetry-sep {
  width: 1px;
  height: 24px;
  background: var(--vp-c-divider);
}

/* 13. Confidential Vault */
.preview-vault {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vault-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.vault-cipher {
  font-weight: 600;
  color: var(--sec-accent);
}
.vault-key {
  color: var(--vp-c-text-3);
  font-size: 0.7rem;
}
.vault-status {
  font-size: 0.7rem;
  color: #10b981;
}

/* 14. Webhook Inspector (Hero full-width) */
.preview-webhook-wide {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.webhook-endpoint {
  display: flex;
  align-items: center;
  gap: 10px;
}
.method-post {
  background: #10b981;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.endpoint-url {
  color: var(--vp-c-text-1);
  font-weight: 500;
  flex: 1;
}
.response-badge {
  font-size: 0.72rem;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.webhook-headers {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}
.header-key {
  color: var(--vp-c-text-2);
}
.header-val {
  color: var(--sec-accent);
}
.verified-tag {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
  font-weight: 600;
}

/* ==========================================================================
   Responsive Breakpoints
   ========================================================================== */
@media (max-width: 960px) {
  .bento-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .bento-span-3 {
    grid-column: span 2;
  }
}

@media (max-width: 640px) {
  .bento-grid {
    grid-template-columns: 1fr;
  }
  .bento-span-1,
  .bento-span-2,
  .bento-span-3 {
    grid-column: span 1;
  }
  .preview-media-pipeline,
  .preview-automations,
  .preview-forms-defense,
  .preview-kanban,
  .webhook-endpoint {
    flex-direction: column;
    align-items: flex-start;
  }
  .preview-kanban {
    grid-template-columns: 1fr;
  }
}
</style>
