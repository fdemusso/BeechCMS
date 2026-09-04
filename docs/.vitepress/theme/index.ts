import DefaultTheme from 'vitepress/theme'
import './custom.css'
import type { Theme } from 'vitepress'
import PackageManagerTabs from './components/PackageManagerTabs.vue'
import FrameworkGrid from './components/FrameworkGrid.vue'
import LlmPromptNode from './components/LlmPromptNode.vue'
import HomeHero from './components/HomeHero.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('PackageManagerTabs', PackageManagerTabs)
    app.component('FrameworkGrid', FrameworkGrid)
    app.component('LlmPromptNode', LlmPromptNode)
    app.component('HomeHero', HomeHero)
  }
} satisfies Theme
