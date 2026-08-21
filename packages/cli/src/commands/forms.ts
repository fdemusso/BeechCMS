// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface FormsOptions {
  framework?: 'react' | 'vue' | 'svelte' | 'vanilla'
  seed?: string
  mode?: 'styled' | 'headless'
  out?: string
  yes?: boolean
  json?: boolean
}

function getReactTemplate(seedSlug: string, mode: 'styled' | 'headless'): string {
  if (mode === 'headless') {
    return `import React, { useState, useEffect } from 'react'

export interface BeechFormProps {
  baseUrl?: string
  apiKey?: string
  seed?: string
  onSuccess?: (res: { id?: string; data: Record<string, unknown> }) => void
  onError?: (err: { status: number; message: string }) => void
}

export function BeechForm({
  baseUrl = process.env.NEXT_PUBLIC_BEECH_API_URL || 'https://api.yourdomain.com',
  apiKey = process.env.NEXT_PUBLIC_BEECH_WRITE_KEY || '',
  seed = '${seedSlug}',
  onSuccess,
  onError,
}: BeechFormProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [honeypotValue, setHoneypotValue] = useState('')
  const [timeTrapToken, setTimeTrapToken] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch(\`\${baseUrl.replace(/\\/+$/, '')}/api/v1/public/timetrap/token\`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.token) setTimeTrapToken(data.token)
      })
      .catch(() => {})
  }, [baseUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Honeypot bot protection check
    if (honeypotValue.trim() !== '') {
      setErrorMessage('Submission rejected.')
      return
    }

    setIsSubmitting(true)
    try {
      const endpoint = \`\${baseUrl.replace(/\\/+$/, '')}/api/v1/public/\${encodeURIComponent(seed)}/add\`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          ...(timeTrapToken ? { 'x-time-trap': timeTrapToken } : {}),
        },
        body: JSON.stringify({
          data: values,
          ...(timeTrapToken ? { _timeTrapToken: timeTrapToken } : {}),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.detail || json.title || 'Form submission failed')
      }

      setIsSuccess(true)
      onSuccess?.({ id: json?.data?.id, data: values })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error submitting form'
      setErrorMessage(msg)
      onError?.({ status: 500, message: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return <div>Thank you! Your message has been sent.</div>
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* 🛡️ Invisible Honeypot Anti-Bot Decoy */}
      <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }} aria-hidden="true">
        <input
          name="fax_number"
          type="text"
          value={honeypotValue}
          onChange={(e) => setHoneypotValue(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <label>Name</label>
        <input
          name="name"
          type="text"
          value={values.name || ''}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Email</label>
        <input
          name="email"
          type="email"
          value={values.email || ''}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Message</label>
        <textarea
          name="message"
          value={values.message || ''}
          onChange={(e) => setValues({ ...values, message: e.target.value })}
          rows={4}
        />
      </div>

      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send'}
      </button>
    </form>
  )
}
`
  }

  return `import React, { useState, useEffect } from 'react'

export interface BeechFormProps {
  baseUrl?: string
  apiKey?: string
  seed?: string
  onSuccess?: (res: { id?: string; data: Record<string, unknown> }) => void
  onError?: (err: { status: number; message: string }) => void
  className?: string
}

export function BeechForm({
  baseUrl = process.env.NEXT_PUBLIC_BEECH_API_URL || 'https://api.yourdomain.com',
  apiKey = process.env.NEXT_PUBLIC_BEECH_WRITE_KEY || '',
  seed = '${seedSlug}',
  onSuccess,
  onError,
  className = '',
}: BeechFormProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [honeypotValue, setHoneypotValue] = useState('')
  const [timeTrapToken, setTimeTrapToken] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch(\`\${baseUrl.replace(/\\/+$/, '')}/api/v1/public/timetrap/token\`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.token) setTimeTrapToken(data.token)
      })
      .catch(() => {})
  }, [baseUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (honeypotValue.trim() !== '') {
      setErrorMessage('Submission rejected.')
      return
    }

    setIsSubmitting(true)
    try {
      const endpoint = \`\${baseUrl.replace(/\\/+$/, '')}/api/v1/public/\${encodeURIComponent(seed)}/add\`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          ...(timeTrapToken ? { 'x-time-trap': timeTrapToken } : {}),
        },
        body: JSON.stringify({
          data: values,
          ...(timeTrapToken ? { _timeTrapToken: timeTrapToken } : {}),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.detail || json.title || 'Form submission failed')
      }

      setIsSuccess(true)
      onSuccess?.({ id: json?.data?.id, data: values })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error submitting form'
      setErrorMessage(msg)
      onError?.({ status: 500, message: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-center font-medium">
        Thank you! Your message has been sent successfully.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={\`space-y-4 max-w-lg mx-auto \${className}\`} noValidate>
      {/* 🛡️ Invisible Honeypot Anti-Bot Decoy */}
      <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }} aria-hidden="true">
        <input
          name="fax_number"
          type="text"
          value={honeypotValue}
          onChange={(e) => setHoneypotValue(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Full Name *</label>
        <input
          type="text"
          value={values.name || ''}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          placeholder="Jane Doe"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Work Email *</label>
        <input
          type="email"
          value={values.email || ''}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          placeholder="jane@company.com"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Message</label>
        <textarea
          value={values.message || ''}
          onChange={(e) => setValues({ ...values, message: e.target.value })}
          placeholder="How can we help you?"
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}
`
}

function getVueTemplate(seedSlug: string, mode: 'styled' | 'headless'): string {
  const isStyled = mode === 'styled'
  return `<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    baseUrl?: string
    apiKey?: string
    seed?: string
  }>(),
  {
    baseUrl: 'https://api.yourdomain.com',
    apiKey: '',
    seed: '${seedSlug}',
  }
)

const emit = defineEmits<{
  (e: 'success', data: { id?: string; data: Record<string, unknown> }): void
  (e: 'error', err: { status: number; message: string }): void
}>>()

const name = ref('')
const email = ref('')
const message = ref('')
const honeypot = ref('')
const timeTrapToken = ref<string | null>(null)
const isSubmitting = ref(false)
const isSuccess = ref(false)
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await fetch(\`\${props.baseUrl.replace(/\\/+$/, '')}/api/v1/public/timetrap/token\`)
    const data = await res.json()
    if (data?.token) timeTrapToken.value = data.token
  } catch {}
})

async function handleSubmit() {
  errorMessage.value = null
  if (honeypot.value.trim() !== '') {
    errorMessage.value = 'Submission rejected.'
    return
  }

  isSubmitting.value = true
  try {
    const payload = { name: name.value, email: email.value, message: message.value }
    const endpoint = \`\${props.baseUrl.replace(/\\/+$/, '')}/api/v1/public/\${encodeURIComponent(props.seed)}/add\`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(props.apiKey ? { 'X-API-Key': props.apiKey } : {}),
        ...(timeTrapToken.value ? { 'x-time-trap': timeTrapToken.value } : {}),
      },
      body: JSON.stringify({
        data: payload,
        ...(timeTrapToken.value ? { _timeTrapToken: timeTrapToken.value } : {}),
      }),
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.detail || json.title || 'Submission failed')

    isSuccess.value = true
    emit('success', { id: json?.data?.id, data: payload })
  } catch (err: any) {
    const msg = err.message || 'Submission error'
    errorMessage.value = msg
    emit('error', { status: 500, message: msg })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div v-if="isSuccess" class="${isStyled ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-center font-medium' : 'success-msg'}">
    Thank you! Your message has been sent successfully.
  </div>

  <form v-else @submit.prevent="handleSubmit" class="${isStyled ? 'space-y-4 max-w-lg mx-auto' : 'beech-form'}">
    <!-- 🛡️ Invisible Honeypot Decoy -->
    <div style="position: absolute; left: -9999px; opacity: 0;" aria-hidden="true">
      <input v-model="honeypot" name="fax_number" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <div>
      <label class="${isStyled ? 'block text-sm font-medium text-gray-700' : ''}">Full Name *</label>
      <input v-model="name" type="text" required class="${isStyled ? 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none' : ''}" />
    </div>

    <div>
      <label class="${isStyled ? 'block text-sm font-medium text-gray-700' : ''}">Work Email *</label>
      <input v-model="email" type="email" required class="${isStyled ? 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none' : ''}" />
    </div>

    <div>
      <label class="${isStyled ? 'block text-sm font-medium text-gray-700' : ''}">Message</label>
      <textarea v-model="message" rows="4" class="${isStyled ? 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none' : ''}"></textarea>
    </div>

    <div v-if="errorMessage" class="${isStyled ? 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700' : 'error-msg'}">
      {{ errorMessage }}
    </div>

    <button type="submit" :disabled="isSubmitting" class="${isStyled ? 'w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50' : ''}">
      {{ isSubmitting ? 'Sending...' : 'Send Message' }}
    </button>
  </form>
</template>
`
}

function getSvelteTemplate(seedSlug: string, mode: 'styled' | 'headless'): string {
  const isStyled = mode === 'styled'
  return `<script lang="ts">
  import { onMount } from 'svelte'

  interface Props {
    baseUrl?: string
    apiKey?: string
    seed?: string
    onSuccess?: (res: { id?: string; data: Record<string, unknown> }) => void
    onError?: (err: { status: number; message: string }) => void
  }

  let {
    baseUrl = 'https://api.yourdomain.com',
    apiKey = '',
    seed = '${seedSlug}',
    onSuccess,
    onError,
  }: Props = $props()

  let name = $state('')
  let email = $state('')
  let message = $state('')
  let honeypot = $state('')
  let timeTrapToken = $state<string | null>(null)
  let isSubmitting = $state(false)
  let isSuccess = $state(false)
  let errorMessage = $state<string | null>(null)

  onMount(async () => {
    try {
      const res = await fetch(\`\${baseUrl.replace(/\\/+$/, '')}/api/v1/public/timetrap/token\`)
      const data = await res.json()
      if (data?.token) timeTrapToken = data.token
    } catch {}
  })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    errorMessage = null
    if (honeypot.trim() !== '') {
      errorMessage = 'Submission rejected.'
      return
    }

    isSubmitting = true
    try {
      const payload = { name, email, message }
      const endpoint = \`\${baseUrl.replace(/\\/+$/, '')}/api/v1/public/\${encodeURIComponent(seed)}/add\`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          ...(timeTrapToken ? { 'x-time-trap': timeTrapToken } : {}),
        },
        body: JSON.stringify({
          data: payload,
          ...(timeTrapToken ? { _timeTrapToken: timeTrapToken } : {}),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.title || 'Submission failed')

      isSuccess = true
      onSuccess?.({ id: json?.data?.id, data: payload })
    } catch (err: any) {
      const msg = err.message || 'Submission error'
      errorMessage = msg
      onError?.({ status: 500, message: msg })
    } finally {
      isSubmitting = false
    }
  }
</script>

{#if isSuccess}
  <div class="${isStyled ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-center font-medium' : 'success'}">
    Thank you! Your message has been sent successfully.
  </div>
{:else}
  <form onsubmit={handleSubmit} class="${isStyled ? 'space-y-4 max-w-lg mx-auto' : 'beech-form'}">
    <!-- 🛡️ Invisible Honeypot Anti-Bot Decoy -->
    <div style="position: absolute; left: -9999px; opacity: 0;" aria-hidden="true">
      <input bind:value={honeypot} name="fax_number" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <div>
      <label class="${isStyled ? 'block text-sm font-medium text-gray-700' : ''}">Full Name *</label>
      <input bind:value={name} type="text" required class="${isStyled ? 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none' : ''}" />
    </div>

    <div>
      <label class="${isStyled ? 'block text-sm font-medium text-gray-700' : ''}">Work Email *</label>
      <input bind:value={email} type="email" required class="${isStyled ? 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none' : ''}" />
    </div>

    <div>
      <label class="${isStyled ? 'block text-sm font-medium text-gray-700' : ''}">Message</label>
      <textarea bind:value={message} rows="4" class="${isStyled ? 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none' : ''}"></textarea>
    </div>

    {#if errorMessage}
      <div class="${isStyled ? 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700' : 'error'}">
        {errorMessage}
      </div>
    {/if}

    <button type="submit" disabled={isSubmitting} class="${isStyled ? 'w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50' : ''}">
      {isSubmitting ? 'Sending...' : 'Send Message'}
    </button>
  </form>
{/if}
`
}

function getVanillaTemplate(seedSlug: string): string {
  return `/**
 * BeechCMS Universal Web Component
 * Usage in HTML:
 *   <script type="module" src="./src/components/BeechForm.js"></script>
 *   <beech-form seed="${seedSlug}" base-url="https://api.yourdomain.com"></beech-form>
 */

class BeechFormElement extends HTMLElement {
  connectedCallback() {
    const seed = this.getAttribute('seed') || '${seedSlug}'
    const baseUrl = (this.getAttribute('base-url') || 'https://api.yourdomain.com').replace(/\\/+$/, '')
    const apiKey = this.getAttribute('api-key') || ''

    this.innerHTML = \`
      <form class="beech-form" style="max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; font-family: system-ui, sans-serif;">
        <div style="position: absolute; left: -9999px; opacity: 0;" aria-hidden="true">
          <input name="fax_number" type="text" tabindex="-1" autocomplete="off" />
        </div>
        <label style="display: flex; flex-direction: column; font-size: 14px; font-weight: 500;">
          Full Name *
          <input name="name" type="text" required style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; margin-top: 4px;" />
        </label>
        <label style="display: flex; flex-direction: column; font-size: 14px; font-weight: 500;">
          Work Email *
          <input name="email" type="email" required style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; margin-top: 4px;" />
        </label>
        <label style="display: flex; flex-direction: column; font-size: 14px; font-weight: 500;">
          Message
          <textarea name="message" rows="4" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; margin-top: 4px;"></textarea>
        </label>
        <div class="feedback" style="display: none; padding: 10px; border-radius: 6px; font-size: 14px;"></div>
        <button type="submit" style="padding: 10px 16px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
          Send Message
        </button>
      </form>
    \`

    const form = this.querySelector('form')
    const feedback = this.querySelector('.feedback')
    let timeTrapToken = null

    fetch(\`\${baseUrl}/api/v1/public/timetrap/token\`)
      .then((r) => r.json())
      .then((d) => { if (d?.token) timeTrapToken = d.token })
      .catch(() => {})

    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const data = Object.fromEntries(fd.entries())

      if (data.fax_number) {
        alert('Bot rejected')
        return
      }

      delete data.fax_number
      const btn = form.querySelector('button')
      if (btn) btn.disabled = true

      try {
        const res = await fetch(\`\${baseUrl}/api/v1/public/\${encodeURIComponent(seed)}/add\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            ...(timeTrapToken ? { 'x-time-trap': timeTrapToken } : {}),
          },
          body: JSON.stringify({
            data,
            ...(timeTrapToken ? { _timeTrapToken: timeTrapToken } : {}),
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.detail || json.title || 'Submission failed')

        if (feedback) {
          feedback.style.display = 'block'
          feedback.style.background = '#f0fdf4'
          feedback.style.color = '#166534'
          feedback.style.border = '1px solid #bbf7d0'
          feedback.textContent = 'Thank you! Your message has been sent successfully.'
        }
        form.reset()
      } catch (err) {
        if (feedback) {
          feedback.style.display = 'block'
          feedback.style.background = '#fef2f2'
          feedback.style.color = '#991b1b'
          feedback.style.border = '1px solid #fecaca'
          feedback.textContent = err.message || 'Error sending message'
        }
      } finally {
        if (btn) btn.disabled = false
      }
    })
  }
}

if (typeof window !== 'undefined' && !customElements.get('beech-form')) {
  customElements.define('beech-form', BeechFormElement)
}

export { BeechFormElement }
`
}

export async function forms(options: FormsOptions = {}): Promise<void> {
  let { framework, seed, mode, out, yes, json } = options

  if (!yes && !json) {
    p.intro(pc.bgCyan(pc.black(' 🌲 BeechCMS Form Generator ')))

    if (!framework) {
      const selected = await p.select({
        message: 'Which framework are you using?',
        options: [
          { value: 'react', label: 'React', hint: 'Next.js / Vite / Remix (.tsx)' },
          { value: 'vue', label: 'Vue 3', hint: 'Nuxt / Vite (.vue)' },
          { value: 'svelte', label: 'Svelte 5', hint: 'SvelteKit (.svelte)' },
          { value: 'vanilla', label: 'Vanilla JS / Web Component', hint: 'HTML / Astro / Universal (.js)' },
        ],
        initialValue: 'react',
      })

      if (p.isCancel(selected)) {
        p.cancel('Operation cancelled.')
        process.exit(0)
      }
      framework = selected as 'react' | 'vue' | 'svelte' | 'vanilla'
    }

    if (!seed) {
      const seedInput = await p.text({
        message: 'Which Seed do you want to bind this form to?',
        placeholder: 'clienti',
        defaultValue: 'clienti',
        validate: (value) => {
          if (!value.trim()) return 'Seed slug cannot be empty'
        },
      })

      if (p.isCancel(seedInput)) {
        p.cancel('Operation cancelled.')
        process.exit(0)
      }
      seed = seedInput.trim()
    }

    if (!mode && framework !== 'vanilla') {
      const modeSelected = await p.select({
        message: 'Choose styling preset:',
        options: [
          { value: 'styled', label: 'Tailwind CSS', hint: 'Full responsive ready-to-use component' },
          { value: 'headless', label: 'Headless / Unstyled', hint: 'Minimal markup with full anti-bot protection' },
        ],
        initialValue: 'styled',
      })

      if (p.isCancel(modeSelected)) {
        p.cancel('Operation cancelled.')
        process.exit(0)
      }
      mode = modeSelected as 'styled' | 'headless'
    }
  }

  // Fallbacks
  framework = framework || 'react'
  seed = seed || 'clienti'
  mode = mode || 'styled'

  const ext =
    framework === 'react'
      ? 'tsx'
      : framework === 'vue'
      ? 'vue'
      : framework === 'svelte'
      ? 'svelte'
      : 'js'

  const filename = `BeechForm.${ext}`
  const targetPath = out ? resolve(process.cwd(), out) : resolve(process.cwd(), 'src', 'components', filename)

  let content = ''
  if (framework === 'react') {
    content = getReactTemplate(seed, mode)
  } else if (framework === 'vue') {
    content = getVueTemplate(seed, mode)
  } else if (framework === 'svelte') {
    content = getSvelteTemplate(seed, mode)
  } else {
    content = getVanillaTemplate(seed)
  }

  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, content, 'utf-8')

  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          file: filename,
          path: targetPath,
          framework,
          seed,
          mode,
        },
        null,
        2
      )
    )
    return
  }

  if (!yes) {
    p.outro(pc.green(`✔ Form component created at ${out ? out : `src/components/${filename}`}`))
    console.log(`\n  ${pc.bold('Next steps:')}`)
    if (framework === 'react') {
      console.log(pc.cyan(`  import { BeechForm } from './components/BeechForm'`))
      console.log(pc.cyan(`  <BeechForm seed="${seed}" />\n`))
    } else if (framework === 'vue') {
      console.log(pc.cyan(`  import BeechForm from './components/BeechForm.vue'`))
      console.log(pc.cyan(`  <BeechForm seed="${seed}" />\n`))
    } else if (framework === 'svelte') {
      console.log(pc.cyan(`  import BeechForm from './components/BeechForm.svelte'`))
      console.log(pc.cyan(`  <BeechForm seed="${seed}" />\n`))
    } else {
      console.log(pc.cyan(`  <script type="module" src="./src/components/BeechForm.js"></script>`))
      console.log(pc.cyan(`  <beech-form seed="${seed}"></beech-form>\n`))
    }
  } else {
    console.log(`Created ${out ? out : `src/components/${filename}`}`)
  }
}
