<script setup lang="ts">
import { withBase } from 'vitepress'

interface FrameworkItem {
  name: string
  link: string
  icon: string
}

const frameworks: FrameworkItem[] = [
  { name: 'React', link: '/start/', icon: 'react' },
  { name: 'Next.js', link: '/start/', icon: 'nextjs' },
  { name: 'Astro', link: '/start/', icon: 'astro' },
  { name: 'Vue', link: '/start/', icon: 'vue' },
  { name: 'Nuxt', link: '/start/', icon: 'nuxt' },
  { name: 'Remix', link: '/start/', icon: 'remix' },
  { name: 'SvelteKit', link: '/start/', icon: 'svelte' },
  { name: 'Hono', link: '/start/', icon: 'hono' }
]
</script>

<template>
  <section class="connect-framework-section">
    <div class="connect-header">
      <h2 class="connect-title">Connect a framework</h2>
      <p class="connect-subtitle">
        Start with a quickstart guide to connect your project in minutes.
      </p>
    </div>

    <div class="framework-grid">
      <a
        v-for="item in frameworks"
        :key="item.name"
        :href="withBase(item.link)"
        class="framework-card"
      >
        <div class="icon-box">
          <!-- React -->
          <svg v-if="item.icon === 'react'" viewBox="-11.5 -10.23174 23 20.46348" width="32" height="32">
            <circle cx="0" cy="0" r="2.05" fill="#61dafb"/>
            <g stroke="#61dafb" stroke-width="1" fill="none">
              <ellipse rx="11" ry="4.2"/>
              <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
              <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
            </g>
          </svg>

          <!-- Next.js -->
          <svg v-else-if="item.icon === 'nextjs'" viewBox="0 0 180 180" width="30" height="30" fill="none">
            <circle cx="90" cy="90" r="90" fill="currentColor"/>
            <path d="M149.508 157.438L69.147 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.141 149.508 157.438Z" fill="var(--vp-c-bg, #000)"/>
            <rect x="115" y="54" width="12" height="72" fill="var(--vp-c-bg, #000)"/>
          </svg>

          <!-- Astro -->
          <svg v-else-if="item.icon === 'astro'" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#FF5D01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
          </svg>

          <!-- Vue -->
          <svg v-else-if="item.icon === 'vue'" viewBox="0 0 24 24" width="30" height="30">
            <path d="M12 15.2 6.5 5.5H2l10 17.5L22 5.5h-4.5z" fill="#42b883"/>
            <path d="M12 15.2 7.4 7.2h3.3L12 9.5l1.3-2.3h3.3z" fill="#35495e"/>
          </svg>

          <!-- Nuxt -->
          <svg v-else-if="item.icon === 'nuxt'" viewBox="0 0 24 24" width="30" height="30" fill="none">
            <path d="M2 18.5h7.2L5.6 12 2 18.5z" fill="#00DC82"/>
            <path d="M7 18.5h15l-7.5-13-4.2 7.3 2.7 4.7H9.2l-2.2-3.8-3.4 6 3.4-1.2z" fill="#00DC82"/>
          </svg>

          <!-- Remix -->
          <svg v-else-if="item.icon === 'remix'" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M3 3h7.5c3.59 0 6.5 2.91 6.5 6.5 0 2.22-1.12 4.19-2.83 5.36L21 21h-5.2l-5.3-5H7v5H3V3zm4 4v5h3.5a2.5 2.5 0 0 0 0-5H7z"/>
          </svg>

          <!-- SvelteKit -->
          <svg v-else-if="item.icon === 'svelte'" viewBox="0 0 24 24" width="30" height="30" fill="none">
            <path d="M17.5 4.5a4 4 0 0 0-5.8-.3l-3.3 3.1a4 4 0 0 0-.4 5.3l1.8-1.7a2 2 0 0 1 .2-2.7l3.3-3.1a2 2 0 0 1 2.9.2 2 2 0 0 1-.2 2.8l-4 3.7a4 4 0 0 0-.2 5.8 4 4 0 0 0 5.8.3l3.3-3.1a4 4 0 0 0 .4-5.3l-1.8 1.7a2 2 0 0 1-.2 2.7l-3.3 3.1a2 2 0 0 1-2.9-.2 2 2 0 0 1 .2-2.8l4-3.7a4 4 0 0 0 .2-5.8z" fill="#FF3E00"/>
          </svg>

          <!-- Hono -->
          <svg v-else-if="item.icon === 'hono'" viewBox="0 0 24 24" width="30" height="30" fill="none">
            <path d="M12 2C8.5 7 6 9.5 6 13.5a6 6 0 0 0 12 0c0-4-2.5-6.5-6-11.5z" fill="#E36002"/>
            <path d="M12 9c-1.8 2.5-3 4-3 6a3 3 0 0 0 6 0c0-2-1.2-3.5-3-6z" fill="#FF9E44"/>
          </svg>
        </div>

        <span class="framework-name">{{ item.name }}</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.connect-framework-section {
  display: grid;
  grid-template-columns: 55% 45%;
  gap: 48px;
  align-items: center;
  margin: 64px 0;
  padding: 12px 0;
}

.connect-header {
  display: flex;
  flex-direction: column;
  max-width: 560px;
}

.connect-title {
  font-family: var(--vp-font-family-heading) !important;
  font-size: 2.1rem !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  letter-spacing: -0.015em !important;
  color: var(--vp-c-text-1) !important;
  margin: 0 0 14px 0 !important;
  border-top: none !important;
  padding-top: 0 !important;
}

.connect-subtitle {
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0 !important;
}

.framework-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 14px;
  max-width: 500px;
  width: 100%;
}

.framework-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  text-decoration: none !important;
  background: transparent;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  color: inherit !important;
}

.framework-card:hover {
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-border);
  box-shadow: var(--vp-shadow-1);
}

.icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-1);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.framework-card:hover .icon-box {
  border-color: var(--vp-c-brand-1);
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(255, 101, 132, 0.18);
}

.framework-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--vp-c-text-1) !important;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

@media (max-width: 960px) {
  .connect-framework-section {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .framework-grid {
    max-width: 100%;
  }
}

@media (max-width: 540px) {
  .framework-grid {
    grid-template-columns: 1fr;
  }
}
</style>
