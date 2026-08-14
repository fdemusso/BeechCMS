import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "BeechCMS",
  base: '/BeechCMS/',
  description: "Edge-native headless CMS",
  srcExclude: ['Sprints/**'],
  ignoreDeadLinks: true,
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
