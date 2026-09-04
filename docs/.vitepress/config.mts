import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "BeechCMS",
  base: '/BeechCMS/',
  description: "Edge-native headless CMS",
  lang: 'en-US',
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
          text: 'Start',
          items: [
            { text: 'Introduction', link: '/start/' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Overview', link: '/features/' }
          ]
        }
      ],
      '/build/': [
        {
          text: 'Build',
          items: [
            { text: 'Integration', link: '/build/' }
          ]
        }
      ],
      '/manage/': [
        {
          text: 'Manage',
          items: [
            { text: 'Management', link: '/manage/' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'API Reference', link: '/reference/' }
          ]
        }
      ],
      '/resources/': [
        {
          text: 'Resources',
          items: [
            { text: 'Assets', link: '/resources/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/flaviodemusso/BeechCMS' }
    ]
  }
})
