import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "BeechCMS",
  description: "Edge-native headless CMS",
  srcExclude: ['Sprints/**'],
  ignoreDeadLinks: true,
  vite: {
    build: {
      target: 'esnext'
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
            { text: 'Frontend & APIs', link: '/frontend-guide' },
            { text: 'Custom Widgets', link: '/custom-widgets' },
            { text: 'Automations', link: '/automations' },
            { text: 'Email Module', link: '/email-module' }
          ]
        },
        {
          text: 'Developer Guide (Internals)',
          items: [
            { text: 'Development', link: '/development' },
            { text: 'Architecture', link: '/architecture' },
            { text: 'System Map', link: '/SYSTEM_MAP' },
            { text: 'Vertical Slice', link: '/vertical-slice' },
            { text: 'Background Queues', link: '/background-queues' },
            { text: 'Observability', link: '/observability-and-notifications' },
            { text: 'Release', link: '/release' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Core API', link: '/api/packages/core/' },
            { text: 'Client API', link: '/api/packages/client/' },
            { text: 'Widget SDK', link: '/api/packages/widget-sdk/' },
            { text: 'CLI', link: '/api/packages/cli/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/flaviodemusso/BeechCMS' }
    ]
  }
})
