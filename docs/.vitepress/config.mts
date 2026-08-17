import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "BeechCMS",
  base: '/BeechCMS/',
  description: "Edge-native headless CMS",
  srcExclude: ['Sprints/**'],
  ignoreDeadLinks: true,
    head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/BeechCMS/images/BeechLogo.svg' }],
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
    logo: {
      light: '/images/LightBeech.svg',
      dark: '/images/DarkBeech.svg',
      alt: 'BeechCMS'
    },
    siteTitle: 'BeechCMS',
    nav: [
      { text: 'Guide', link: '/guide' },
      { text: 'API', link: '/api/' }
    ],
    sidebar: {
      '/': [
        {
          text: 'User & Builder Guide',
          items: [
            { text: 'Getting Started', link: '/guide' },
            { text: 'First Project', link: '/first-project' },
            { text: 'Content Editor Guide', link: '/content-editor-guide' },
            { text: 'Content API & SDK', link: '/content-api' },
            { text: 'Custom Widgets', link: '/custom-widgets' },
            { text: 'Automations', link: '/automations' },
            { text: 'Email Module', link: '/email-module' },
            { text: 'Observability & Notifications', link: '/observability-and-notifications' }
          ]
        },
        {
          text: 'Developer Guide (Internals)',
          items: [
            { text: 'Development', link: '/development' },
            { text: 'Architecture', link: '/architecture' },
            { text: 'Vertical Slice', link: '/vertical-slice' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'REST API', link: '/api-reference' },
            { text: 'Core API (@beechcms/core)', link: '/api/@beechcms/core/' },
            { text: 'Client SDK (@beechcms/client)', link: '/api/@beechcms/client/' },
            { text: 'Widget SDK (@beechcms/widget-sdk)', link: '/api/@beechcms/widget-sdk/' },
            { text: 'CLI Tools (@beechcms/cli)', link: '/api/@beechcms/cli/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/flaviodemusso/BeechCMS' }
    ]
  }
})
