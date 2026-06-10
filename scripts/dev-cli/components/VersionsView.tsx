import React from 'react'
import { Box, Text } from 'ink'
import type { LogStore } from '../log-store'

export interface VersionsViewProps {
  monorepoVersion: string
  logStore: LogStore
}

const WRANGLER_VERSION_RE = /wrangler\s+(\d+\.\d+\.\d+)/i
const VITE_VERSION_RE = /VITE\s+v(\d+\.\d+\.\d+)/i

function detectToolVersion(logStore: LogStore, source: 'api' | 'dashboard', pattern: RegExp): string | undefined {
  for (const line of logStore.getLines(source)) {
    const match = line.text.match(pattern)
    if (match) return match[1]
  }
  return undefined
}

export function VersionsView({ monorepoVersion, logStore }: VersionsViewProps) {
  const wranglerVersion = detectToolVersion(logStore, 'api', WRANGLER_VERSION_RE)
  const viteVersion = detectToolVersion(logStore, 'dashboard', VITE_VERSION_RE)
  const notices = logStore.getVersionNotices()

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>BEECHCMS</Text>
        <Text>Monorepo version: {monorepoVersion}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>DETECTED TOOL VERSIONS</Text>
        <Text>Wrangler: {wranglerVersion ?? 'detecting…'}</Text>
        <Text>Vite:     {viteVersion ?? 'detecting…'}</Text>
      </Box>

      <Box flexDirection="column">
        <Text bold underline>UPDATE NOTICES</Text>
        {notices.length === 0 ? (
          <Text dimColor>(none)</Text>
        ) : (
          notices.map((notice, index) => (
            <Text key={index} dimColor>
              {notice}
            </Text>
          ))
        )}
      </Box>
    </Box>
  )
}
