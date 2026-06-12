import React from 'react'
import { Box, Text } from 'ink'
import type { EndpointInfo } from '../endpoints'

export interface EndpointsViewProps {
  endpoints: EndpointInfo[]
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'green',
  POST: 'yellow',
  PUT: 'blue',
  PATCH: 'magenta',
  DELETE: 'red',
}

export function EndpointsView({ endpoints }: EndpointsViewProps) {
  const groups = new Map<string, EndpointInfo[]>()
  for (const endpoint of endpoints) {
    const list = groups.get(endpoint.group) ?? []
    list.push(endpoint)
    groups.set(endpoint.group, list)
  }

  return (
    <Box flexDirection="column">
      {Array.from(groups.entries()).map(([group, items]) => (
        <Box key={group} flexDirection="column" marginBottom={1}>
          <Text bold underline>{group}</Text>
          {items.map((item, index) => (
            <Box key={index}>
              <Box width={8}>
                <Text color={METHOD_COLORS[item.method] ?? 'white'} bold>
                  {item.method}
                </Text>
              </Box>
              <Text>{item.path}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}
