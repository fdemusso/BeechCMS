<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const props = defineProps<{
  command?: string
  npm?: string
  pnpm?: string
  yarn?: string
  bun?: string
}>()

const STORAGE_KEY = 'beechcms_pkg_mgr'
type PkgMgr = 'npm' | 'pnpm' | 'yarn' | 'bun'
const MANAGERS: PkgMgr[] = ['npm', 'pnpm', 'yarn', 'bun']

const activeMgr = ref<PkgMgr>('pnpm')
const copied = ref(false)

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as PkgMgr | null
    if (saved && MANAGERS.includes(saved)) {
      activeMgr.value = saved
    }
  } catch {
    // Restricted or unavailable localStorage fallback
  }

  window.addEventListener('storage', onStorageChange)
  window.addEventListener('beech:pkg-mgr-change', onCustomChange as EventListener)
})

function onStorageChange(e: StorageEvent) {
  if (e.key === STORAGE_KEY && e.newValue && MANAGERS.includes(e.newValue as PkgMgr)) {
    activeMgr.value = e.newValue as PkgMgr
  }
}

function onCustomChange(e: Event) {
  const detail = (e as CustomEvent<PkgMgr>).detail
  if (detail && MANAGERS.includes(detail)) {
    activeMgr.value = detail
  }
}

function selectMgr(mgr: PkgMgr) {
  activeMgr.value = mgr
  try {
    localStorage.setItem(STORAGE_KEY, mgr)
    window.dispatchEvent(new CustomEvent('beech:pkg-mgr-change', { detail: mgr }))
  } catch {
    // Fallback when storage restricted
  }
}

const computedCommands = computed<Record<PkgMgr, string>>(() => {
  if (props.npm || props.pnpm || props.yarn || props.bun) {
    return {
      npm: props.npm || '',
      pnpm: props.pnpm || '',
      yarn: props.yarn || '',
      bun: props.bun || ''
    }
  }
  if (props.command) {
    const cmd = props.command.trim()
    if (cmd.startsWith('create ') || cmd.startsWith('create-')) {
      return {
        npm: `npm ${cmd}`,
        pnpm: `pnpm ${cmd}`,
        yarn: `yarn ${cmd}`,
        bun: `bun ${cmd}`
      }
    }
    if (cmd.startsWith('run ') || cmd.startsWith('exec ')) {
      return {
        npm: `npm ${cmd}`,
        pnpm: `pnpm ${cmd}`,
        yarn: `yarn ${cmd}`,
        bun: `bun ${cmd}`
      }
    }
    return {
      npm: `npm install ${cmd}`,
      pnpm: `pnpm add ${cmd}`,
      yarn: `yarn add ${cmd}`,
      bun: `bun add ${cmd}`
    }
  }
  return {
    npm: '',
    pnpm: '',
    yarn: '',
    bun: ''
  }
})

const currentCommandText = computed(() => {
  return computedCommands.value[activeMgr.value]
})

async function copyCommand() {
  const text = currentCommandText.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
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
  <div class="package-manager-tabs">
    <div class="tabs-bar">
      <div class="tabs-list" role="tablist">
        <button
          v-for="mgr in MANAGERS"
          :key="mgr"
          type="button"
          role="tab"
          :aria-selected="activeMgr === mgr"
          :class="['tab-trigger', { active: activeMgr === mgr }]"
          @click="selectMgr(mgr)"
        >
          {{ mgr }}
        </button>
      </div>
      <button
        v-if="currentCommandText"
        type="button"
        class="copy-btn"
        :title="copied ? 'Copied!' : 'Copy command'"
        @click="copyCommand"
      >
        <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span class="copy-label">{{ copied ? 'Copied!' : 'Copy' }}</span>
      </button>
    </div>

    <div class="tab-panel">
      <!-- Named slot takes precedence if provided -->
      <div v-show="activeMgr === 'npm' && $slots.npm" class="slot-container">
        <slot name="npm" />
      </div>
      <div v-show="activeMgr === 'pnpm' && $slots.pnpm" class="slot-container">
        <slot name="pnpm" />
      </div>
      <div v-show="activeMgr === 'yarn' && $slots.yarn" class="slot-container">
        <slot name="yarn" />
      </div>
      <div v-show="activeMgr === 'bun' && $slots.bun" class="slot-container">
        <slot name="bun" />
      </div>

      <!-- Fallback command block if slots not provided -->
      <div
        v-if="!$slots[activeMgr] && currentCommandText"
        class="code-display"
      >
        <pre><code><span class="cmd-prefix">$</span> {{ currentCommandText }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.package-manager-tabs {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-elv);
  overflow: hidden;
}

.tabs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
}

.tabs-list {
  display: flex;
  gap: 4px;
}

.tab-trigger {
  padding: 8px 14px;
  font-size: 0.85rem;
  font-family: var(--vp-font-family-mono);
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-trigger:hover {
  color: var(--vp-c-brand-1);
}

.tab-trigger.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
  font-weight: 600;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-btn:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-border);
}

.code-display {
  padding: 14px 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  line-height: 1.5;
  background: var(--vp-c-bg-alt);
  overflow-x: auto;
}

.code-display pre {
  margin: 0;
  padding: 0;
  background: transparent;
}

.code-display code {
  color: var(--vp-c-text-1) !important;
  background: transparent !important;
  padding: 0 !important;
}

.cmd-prefix {
  user-select: none;
  color: var(--vp-c-brand-1);
  margin-right: 8px;
}

.slot-container :deep(div[class*='language-']) {
  margin: 0 !important;
  border-radius: 0 !important;
}
</style>
