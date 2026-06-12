import React, { useState, useSyncExternalStore } from 'react'
import { Box, Text, useInput } from 'ink'
import type { Orchestrator } from '../orchestrator'
import type { LogSource } from '../log-store'
import { parseEndpoints, type EndpointInfo } from '../endpoints'
import { StatusPanel } from './StatusPanel'
import { LogView } from './LogView'
import { EndpointsView } from './EndpointsView'
import { VersionsView } from './VersionsView'
import { ErrorBar } from './ErrorBar'
import { TabBar, type TabDef } from './TabBar'

const TABS: TabDef[] = [
  { key: '1', label: 'Status' },
  { key: '2', label: 'API Logs' },
  { key: '3', label: 'Dashboard Logs' },
  { key: '4', label: 'Core Logs' },
  { key: '5', label: 'System Logs' },
  { key: '6', label: 'Endpoints' },
  { key: '7', label: 'Versions' },
]

const PAGE_STEP = 10

export interface DevAppProps {
  orchestrator: Orchestrator
  version: string
  onQuit: () => void
}

function useOrchestratorRevision(orchestrator: Orchestrator): number {
  return useSyncExternalStore(
    (onChange) => {
      orchestrator.on('change', onChange)
      return () => {
        orchestrator.off('change', onChange)
      }
    },
    () => orchestrator.getRevision(),
  )
}

export function DevApp({ orchestrator, version, onQuit }: DevAppProps) {
  useOrchestratorRevision(orchestrator)

  const [activeTab, setActiveTab] = useState(0)
  const [selectedErrorIndex, setSelectedErrorIndex] = useState(0)
  const [scrollOffsets, setScrollOffsets] = useState<Record<LogSource, number>>({
    api: 0,
    dashboard: 0,
    core: 0,
    docker: 0,
    bootstrap: 0,
    system: 0,
  })
  const [shuttingDown, setShuttingDown] = useState(false)
  const [endpoints] = useState<EndpointInfo[]>(() => parseEndpoints())

  const errors = orchestrator.logStore.getErrors()
  const clampedErrorIndex = errors.length === 0 ? 0 : Math.min(selectedErrorIndex, errors.length - 1)

  const tabs = TABS.map((tab) => {
    let hasError = false
    if (tab.key === '1') {
      hasError = errors.length > 0
    } else if (tab.key === '2') {
      hasError = errors.some((e) => e.source === 'api')
    } else if (tab.key === '3') {
      hasError = errors.some((e) => e.source === 'dashboard')
    } else if (tab.key === '4') {
      hasError = errors.some((e) => e.source === 'core')
    } else if (tab.key === '5') {
      hasError = errors.some((e) => ['docker', 'bootstrap', 'system'].includes(e.source))
    }
    return { ...tab, hasError }
  })

  useInput((input, key) => {
    if (shuttingDown) return

    if (input === 'q' || (key.ctrl && input === 'c')) {
      setShuttingDown(true)
      onQuit()
      return
    }

    const tabIndex = TABS.findIndex((tab) => tab.key === input)
    if (tabIndex !== -1) {
      setActiveTab(tabIndex)
      return
    }

    if ((key.tab && key.shift) || key.leftArrow) {
      setActiveTab((i) => (i - 1 + TABS.length) % TABS.length)
      return
    }
    if ((key.tab && !key.shift) || key.rightArrow) {
      setActiveTab((i) => (i + 1) % TABS.length)
      return
    }

    if (input === 'd' && errors.length > 0) {
      orchestrator.logStore.toggleErrorExpanded(clampedErrorIndex)
      return
    }
    if (input === 'x' && errors.length > 0) {
      orchestrator.logStore.dismissError(clampedErrorIndex)
      setSelectedErrorIndex((i) => Math.max(0, i - 1))
      return
    }

    const logSource: LogSource | 'combinedSystem' | null =
      activeTab === 1
        ? 'api'
        : activeTab === 2
        ? 'dashboard'
        : activeTab === 3
        ? 'core'
        : activeTab === 4
        ? 'combinedSystem'
        : null
    const step = key.pageUp || key.pageDown ? PAGE_STEP : 1

    if (key.upArrow || key.pageUp) {
      if (logSource) {
        const total = logSource === 'combinedSystem'
          ? [
              ...orchestrator.logStore.getLines('docker'),
              ...orchestrator.logStore.getLines('bootstrap'),
              ...orchestrator.logStore.getLines('system')
            ].length
          : orchestrator.logStore.getLines(logSource).length
        const keyName = logSource === 'combinedSystem' ? 'system' : logSource
        setScrollOffsets((prev) => ({
          ...prev,
          [keyName]: Math.min(Math.max(0, total - 1), prev[keyName] + step),
        }))
      } else if (activeTab === 0 && errors.length > 0) {
        setSelectedErrorIndex((i) => Math.min(errors.length - 1, i + 1))
      }
      return
    }

    if (key.downArrow || key.pageDown) {
      if (logSource) {
        const keyName = logSource === 'combinedSystem' ? 'system' : logSource
        setScrollOffsets((prev) => ({
          ...prev,
          [keyName]: Math.max(0, prev[keyName] - step),
        }))
      } else if (activeTab === 0 && errors.length > 0) {
        setSelectedErrorIndex((i) => Math.max(0, i - 1))
      }
      return
    }
  })

  const rows = process.stdout.rows ?? 24
  const errorBarHeight = errors.length > 0 ? Math.min(errors.length, 4) + 2 : 0
  const logHeight = Math.max(5, rows - 9 - errorBarHeight)

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      width={Math.max(94, process.stdout.columns ?? 100)}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="magenta">
          BeechCMS Developer Console
        </Text>
        <Text color="gray">Version: <Text color="yellow" bold>v{version}</Text></Text>
      </Box>

      {shuttingDown ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} justifyContent="center">
          <Text color="yellow" bold>Shutting down dev stack, please wait...</Text>
        </Box>
      ) : (
        <>
          <ErrorBar errors={errors} selectedIndex={clampedErrorIndex} />

          <Box flexDirection="column" marginY={1}>
            {activeTab === 0 && (
              <StatusPanel
                services={orchestrator.getServices()}
                containers={orchestrator.getDockerContainers()}
                ports={orchestrator.getPorts()}
              />
            )}
            {activeTab === 1 && (
              <LogView lines={orchestrator.logStore.getLines('api')} height={logHeight} scrollOffset={scrollOffsets.api} />
            )}
            {activeTab === 2 && (
              <LogView
                lines={orchestrator.logStore.getLines('dashboard')}
                height={logHeight}
                scrollOffset={scrollOffsets.dashboard}
              />
            )}
            {activeTab === 3 && (
              <LogView
                lines={orchestrator.logStore.getLines('core')}
                height={logHeight}
                scrollOffset={scrollOffsets.core}
              />
            )}
            {activeTab === 4 && (
              <LogView
                lines={[
                  ...orchestrator.logStore.getLines('docker'),
                  ...orchestrator.logStore.getLines('bootstrap'),
                  ...orchestrator.logStore.getLines('system')
                ].sort((a, b) => a.timestamp - b.timestamp)}
                height={logHeight}
                scrollOffset={scrollOffsets.system}
              />
            )}
            {activeTab === 5 && <EndpointsView endpoints={endpoints} />}
            {activeTab === 6 && <VersionsView monorepoVersion={version} logStore={orchestrator.logStore} />}
          </Box>
        </>
      )}

      <TabBar tabs={tabs} activeIndex={activeTab} />
    </Box>
  )
}
