<script setup lang="ts">
import { withBase } from 'vitepress'

interface BentoFeature {
  title: string
  badge: string
  link: string
  description: string
  span: 1 | 2
  preview?: string[]
}

interface BentoSection {
  title: string
  features: BentoFeature[]
}

const sections: BentoSection[] = [
  {
    title: 'Content & Media Engine',
    features: [
      {
        title: 'Direct-to-R2 Media Engine',
        badge: 'Edge Storage',
        link: '/features/media-engine',
        description: 'Stream media directly to Cloudflare R2 / S3 storage via AWS SigV4 presigned URLs. Zero Worker memory footprint with CDN-cached delivery.',
        span: 2,
        preview: ['Client', '/', 'SigV4 Presigned URL', '/', 'Cloudflare R2 (Edge CDN)']
      },
      {
        title: 'Drafts & Versioning',
        badge: 'Lifecycle',
        link: '/features/drafts',
        description: 'Staged draft workflows, schema-validated partial updates, visual diff comparisons, and atomic publishing guarantees.',
        span: 1
      },
      {
        title: 'Bidirectional Backrefs',
        badge: 'Relational Graph',
        link: '/features/backrefs',
        description: 'Graph-aware relational tracking with inbound reference lookups and automated cascade deletion guards.',
        span: 1
      },
      {
        title: 'TipTap Rich Text Engine',
        badge: 'Editorial AST',
        link: '/features/richtext-editor',
        description: 'Structured ProseMirror JSON AST output, inline drag-and-drop media uploads, automated orphan cleanup, and strict HTML sanitization.',
        span: 2,
        preview: ['ProseMirror JSON', '/', 'Sanitized AST', '/', 'Orphan Asset Pruning']
      }
    ]
  },
  {
    title: 'Editorial Experience & Productivity',
    features: [
      {
        title: 'Editorial Views: Kanban & Gallery',
        badge: 'Dashboard UI',
        link: '/features/editorial-views',
        description: 'Multi-perspective content management with drag-and-drop status boards, visual asset galleries, and transactional multi-step bulk edits.',
        span: 2,
        preview: ['Kanban Board', '/', 'Asset Gallery', '/', 'Bulk Actions']
      },
      {
        title: 'Command Palette (Cmd+K)',
        badge: 'Keyboard-First',
        link: '/features/command-palette',
        description: 'Instant spotlight navigation, fuzzy collection filtering, deep record search, and rapid editorial actions right from the keyboard.',
        span: 1
      },
      {
        title: 'Forms SDK & Anti-Bot',
        badge: 'Lead Capture',
        link: '/features/forms',
        description: 'Zero-secret public submissions protected with cryptographic Time-Trap tokens and Honeypot defenses.',
        span: 1
      },
      {
        title: 'Email Module',
        badge: 'Notifications',
        link: '/features/email-module',
        description: 'Decoupled transactional email delivery and templating with native Resend support and custom SMTP adapters.',
        span: 2,
        preview: ['Resend & SMTP', '/', 'sendTemplateEmail()', '/', 'Transactional Delivery']
      }
    ]
  },
  {
    title: 'Security, Workflows & Integrations',
    features: [
      {
        title: 'Automations Engine',
        badge: 'Event-Driven',
        link: '/features/automations',
        description: 'Trigger automated workflows, webhooks, and transactional notifications on content lifecycle events or scheduled cron intervals.',
        span: 2,
        preview: ['on("content.publish")', '/', 'dispatchWebhook()', '/', 'enqueueQStash()']
      },
      {
        title: 'Search SDK & Embeddings',
        badge: 'Hybrid Search',
        link: '/features/search',
        description: 'Edge-native vector semantic search and full-text hybrid querying powered by @beechcms/search-client.',
        span: 1
      },
      {
        title: 'Edge Analytics',
        badge: 'Telemetry',
        link: '/features/analytics',
        description: 'Non-blocking edge request telemetry, per-Seed traffic breakdowns, storage quotas, and unused media detection.',
        span: 1
      },
      {
        title: 'Confidential Data & Field Lifecycle',
        badge: 'Cryptography',
        link: '/features/confidential-data',
        description: 'GDPR-compliant field policies, salted hashes, and cryptographic key rotation without database downtime or re-indexing locks.',
        span: 2,
        preview: ['AES-GCM-256', '/', 'Application-Level Encryption', '/', 'Zero-Downtime Rotation']
      },
      {
        title: 'Webhooks & Event Delivery',
        badge: 'Integrations',
        link: '/features/webhooks',
        description: 'HMAC-SHA256 signed outbound event dispatching for Next.js on-demand ISR revalidation, Jamstack rebuilds, and microservice sync.',
        span: 2,
        preview: ['POST /api/revalidate', '/', 'HMAC-SHA256 Signature', '/', '200 OK']
      },
      {
        title: 'Observability & Queues',
        badge: 'Reliability',
        link: '/features/observability',
        description: 'Asynchronous job queues powered by Upstash QStash and immutable Cloudflare D1 activity audit logs.',
        span: 1
      }
    ]
  }
]
</script>

<template>
  <div class="features-bento-wrapper">
    <div v-for="section in sections" :key="section.title" class="bento-section-group">
      <h2 :id="section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')">{{ section.title }}</h2>
      <div class="bento-grid">
        <a
          v-for="feature in section.features"
          :key="feature.title"
          :href="withBase(feature.link)"
          class="bento-card"
          :class="feature.span === 2 ? 'bento-span-2' : 'bento-span-1'"
        >
          <div class="bento-card-top">
            <div class="bento-card-header">
              <span class="bento-badge">{{ feature.badge }}</span>
            </div>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </div>
          <div v-if="feature.preview" class="bento-preview">
            <span v-for="(token, i) in feature.preview" :key="i" :class="{ 'token-code': token.includes('(') || token.includes('AES') || token.includes('JSON') || token.includes('SigV4') || token.includes('POST') }">
              {{ token }}
            </span>
          </div>
        </a>
      </div>
    </div>
  </div>
</template>
