import React from 'react'
import { Box, Text } from 'ink'
import type { LogLine } from '../log-store'

export interface LogViewProps {
  lines: readonly LogLine[]
  height: number
  /** Lines scrolled up from the bottom. 0 means "live" (auto-follow newest lines). */
  scrollOffset: number
}

function colorForLevel(level: LogLine['level']): string | undefined {
  switch (level) {
    case 'error':
      return 'red'
    case 'warn':
      return 'yellow'
    default:
      return undefined
  }
}

export function LogView({ lines, height, scrollOffset }: LogViewProps) {
  const total = lines.length
  const start = Math.max(0, total - height - scrollOffset)
  const end = Math.max(0, total - scrollOffset)
  const visible = lines.slice(start, end)
  const isLive = scrollOffset === 0

  return (
    <Box flexDirection="column" height={height + 1}>
      <Box flexDirection="column" flexGrow={1}>
        {visible.length === 0 ? (
          <Text dimColor>(no output yet)</Text>
        ) : (
          visible.map((line, index) => (
            <Text key={`${start + index}-${line.timestamp}`} color={colorForLevel(line.level)} wrap="truncate-end">
              {line.text}
            </Text>
          ))
        )}
      </Box>
      <Text dimColor>{isLive ? '● live' : `⏸ scroll (${scrollOffset} from bottom)`}</Text>
    </Box>
  )
}
