import React from 'react'
import { Box, Text } from 'ink'

export interface TabDef {
  key: string
  label: string
  hasError?: boolean
}

export interface TabBarProps {
  tabs: readonly TabDef[]
  activeIndex: number
}

export function TabBar({ tabs, activeIndex }: TabBarProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        {tabs.map((tab, index) => {
          const isActive = index === activeIndex
          const hasError = tab.hasError

          let borderColor = 'gray'
          if (isActive) {
            borderColor = 'cyan'
          } else if (hasError) {
            borderColor = 'red'
          }

          return (
            <Box
              key={tab.key}
              borderStyle="round"
              borderColor={borderColor}
              paddingX={1}
              marginRight={1}
            >
              <Text bold={isActive} color={isActive ? 'cyan' : (hasError ? 'red' : 'gray')}>
                <Text color={isActive ? 'yellow' : (hasError ? 'red' : 'gray')} bold>[{tab.key}]</Text> {tab.label}
                {hasError && <Text color="red" bold> ✘</Text>}
              </Text>
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Text dimColor>Navigation: </Text>
          <Text bold color="yellow">Tab / Shift+Tab</Text>
          <Text dimColor> or </Text>
          <Text bold color="yellow">← / →</Text>
          <Text dimColor> or keys </Text>
          <Text bold color="yellow">1-7</Text>
        </Box>
        <Box>
          <Text dimColor>Actions: </Text>
          <Text bold color="red">d</Text>
          <Text dimColor> expand error · </Text>
          <Text bold color="red">x</Text>
          <Text dimColor> dismiss · </Text>
          <Text bold color="red">q</Text>
          <Text dimColor> quit</Text>
        </Box>
      </Box>
    </Box>
  )
}
