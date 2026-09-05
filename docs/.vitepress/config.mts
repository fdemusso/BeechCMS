import { defineConfig } from 'vitepress'

/**
 * Public documentation base URL for AI prompts and external references.
 * Set your production domain here when going live (e.g. 'https://beechcms.dev/' or 'https://docs.beechcms.dev/').
 * Can also be overridden dynamically via the DOCS_BASE_URL environment variable.
 */
export const DOCS_BASE_URL = process.env.DOCS_BASE_URL || 'https://beechcms.dev/'
export const DOCS_BASE_PATH = process.env.DOCS_BASE_PATH || '/BeechCMS/'

export default defineConfig({
  title: "BeechCMS",
  base: DOCS_BASE_PATH,
  description: "Edge-native headless CMS",
  lang: 'en-US',
  srcExclude: ['Sprints/**', 'personal/**', 'examples/**', 'ci/**'],
  ignoreDeadLinks: [
    /^https?:\/\/localhost/,
  ],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${DOCS_BASE_PATH.endsWith('/') ? DOCS_BASE_PATH : `${DOCS_BASE_PATH}/`}images/BeechLogo.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=JetBrains+Mono:wght@400;500;600&display=swap' }]
  ],
  vite: {
    build: {
      target: 'esnext'
    },
    esbuild: {
      target: 'esnext'
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext'
      }
    }
  },
  themeConfig: {
    docsBaseUrl: DOCS_BASE_URL,
    outline: {
      level: [2, 3],
      label: 'On this page'
    },
    logo: {
      light: '/images/LightBeech.svg',
      dark: '/images/DarkBeech.svg',
      alt: 'BeechCMS'
    },
    siteTitle: 'BeechCMS',
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Start', link: '/start/' },
      { text: 'Features', link: '/features/' },
      { text: 'Build', link: '/build/' },
      { text: 'Manage', link: '/manage/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Resources', link: '/resources/' }
    ],
    sidebar: {
      '/start/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/start/' },
            { text: 'Your First Project', link: '/start/first-project' }
          ]
        },
        {
          text: 'Framework Integration',
          items: [
            { text: 'React', link: '/start/frameworks/react' },
            { text: 'Next.js', link: '/start/frameworks/nextjs' },
            { text: 'Astro', link: '/start/frameworks/astro' },
            { text: 'Vue', link: '/start/frameworks/vue' },
            { text: 'Nuxt', link: '/start/frameworks/nuxt' },
            { text: 'Remix', link: '/start/frameworks/remix' },
            { text: 'SvelteKit', link: '/start/frameworks/sveltekit' },
            { text: 'Hono', link: '/start/frameworks/hono' }
          ]
        }
      ],
      '/build/': [
        {
          text: 'Overview',
          items: [
            { text: 'Building with BeechCMS', link: '/build/' }
          ]
        },
        {
          text: 'Content Modeling',
          items: [
            { text: 'Schema Modeling', link: '/build/schema-modeling' },
            { text: 'Field Policies & Encryption', link: '/build/field-policies' }
          ]
        },
        {
          text: 'Extension & Customization',
          items: [
            { text: 'Custom Widgets', link: '/build/custom-widgets' }
          ]
        },
        {
          text: 'Tooling & Architecture',
          items: [
            { text: 'CLI Workflows', link: '/build/cli-workflows' },
            { text: 'Vertical Slice Architecture', link: '/build/vertical-slice-architecture' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features Overview',
          items: [
            { text: 'Overview', link: '/features/' }
          ]
        },
        {
          text: 'Content & Media Engine',
          items: [
            { text: 'Drafts & Publishing', link: '/features/drafts' },
            { text: 'Direct-to-R2 Media', link: '/features/media-engine' },
            { text: 'Relationships & Backrefs', link: '/features/backrefs' },
            { text: 'TipTap Rich Text', link: '/features/richtext-editor' }
          ]
        },
        {
          text: 'Editorial Experience',
          items: [
            { text: 'Views: Kanban & Bulk', link: '/features/editorial-views' },
            { text: 'Command Palette (Cmd+K)', link: '/features/command-palette' },
            { text: 'Forms & Anti-Bot', link: '/features/forms' },
            { text: 'Email Module', link: '/features/email-module' }
          ]
        },
        {
          text: 'Workflows & Security',
          items: [
            { text: 'Automations', link: '/features/automations' },
            { text: 'Search & Hybrid Retrieval', link: '/features/search' },
            { text: 'Edge Analytics', link: '/features/analytics' },
            { text: 'Confidential Data', link: '/features/confidential-data' },
            { text: 'Webhooks & Events', link: '/features/webhooks' },
            { text: 'Observability', link: '/features/observability' }
          ]
        }
      ],
      '/manage/': [
        {
          text: 'Management',
          items: [
            { text: 'Overview', link: '/manage/' },
            { text: 'Content Editor', link: '/manage/content-editor' },
            { text: 'Environments', link: '/manage/environments' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Core Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Security Stack', link: '/reference/security-stack' },
            { text: 'Error Model', link: '/reference/error-model' },
            { text: 'Architecture', link: '/reference/architecture' }
          ]
        },
        {
          text: 'API Endpoints',
          items: [
            { text: 'Auth Endpoints', link: '/reference/auth-endpoints' },
            { text: 'Internal Content', link: '/reference/internal-content' },
            { text: 'Public API', link: '/reference/public-api' },
            { text: 'Media Engine', link: '/reference/media-engine' },
            { text: 'Seed Builder', link: '/reference/seed-builder' }
          ]
        },
        {
          text: 'Extensions',
          items: [
            { text: 'Widget API', link: '/reference/widget-api' },
            { text: 'Automations', link: '/reference/automations-api' },
            { text: 'Dashboard Layout', link: '/reference/dashboard-layout' }
          ]
        },
        {
          text: 'Official SDKs & APIs',
          items: [
            { text: 'Client SDK (@beechcms/client)', link: '/reference/client-sdk' },
            { text: 'TypeScript API (TypeDoc)', link: '/api/' }
          ]
        }
      ],
      '/resources/': [
        {
          text: 'Resources',
          items: [
            { text: 'Overview', link: '/resources/' },
            { text: 'Community Assets', link: '/resources/community-assets' },
            { text: 'Architecture Deep-Dive', link: '/resources/architecture' },
            { text: 'Contributor Setup', link: '/resources/development' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/flaviodemusso/BeechCMS' }
    ]
  }
})
