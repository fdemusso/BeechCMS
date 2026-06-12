import React from 'react'
import { Box, Text } from 'ink'
import type { ErrorEntry } from '../log-store'

export interface ErrorBarProps {
  errors: readonly ErrorEntry[]
  selectedIndex: number
}

export function ErrorBar({ errors, selectedIndex }: ErrorBarProps) {
  if (errors.length === 0) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Text bold color="red">RECENT ERRORS</Text>
      {errors.map((error, index) => {
        const selected = index === selectedIndex
        return (
          <Box key={`${error.source}-${error.timestamp}-${index}`} flexDirection="column">
            <Text color={selected ? 'black' : 'red'} backgroundColor={selected ? 'red' : undefined}>
              {selected ? '▸ ' : '  '}[{error.source}] {error.code}
            </Text>
            {error.expanded && (
              <Box paddingLeft={4} flexDirection="column">
                {error.fullText.split('\n').map((line, lineIndex) => (
                  <Text key={lineIndex} dimColor>
                    {line}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
