import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { DockerContainerStatus, ManagedService, PortAllocation } from '../orchestrator'

function StatusIcon({ status }: { status: ManagedService['status'] }) {
  switch (status) {
    case 'ready':
      return <Text color="green" bold>✔ READY</Text>
    case 'error':
      return <Text color="red" bold>✖ ERROR</Text>
    case 'starting':
      return (
        <Text color="yellow">
          <Spinner type="dots" /> <Text bold>STARTING</Text>
        </Text>
      )
    case 'stopped':
      return <Text color="gray" bold>■ STOPPED</Text>
    default:
      return <Text color="gray" bold>· PENDING</Text>
  }
}

function ContainerIcon({ state }: { state: string }) {
  const running = /running/i.test(state)
  return running ? <Text color="green" bold>✔</Text> : <Text color="red" bold>✖</Text>
}

export interface StatusPanelProps {
  services: ManagedService[]
  containers: DockerContainerStatus[]
  ports: PortAllocation | null
}

export function StatusPanel({ services, containers, ports }: StatusPanelProps) {
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">SYSTEM SERVICES STATUS</Text>
        </Box>
        {services.map((service) => (
          <Box key={service.id} flexDirection="column" marginBottom={service.id === 'docker' ? 1 : 0}>
            <Box>
              <Box width={24}>
                <Text bold color="white">  {service.label}</Text>
              </Box>
              <Box width={16}>
                <StatusIcon status={service.status} />
              </Box>
              <Text dimColor>{service.detail ?? ''}</Text>
            </Box>
            {service.id === 'docker' && containers.length > 0 && (
              <Box paddingLeft={2} marginTop={1} flexDirection="row">
                <Text dimColor>Containers: </Text>
                {containers.map((container) => (
                  <Box key={container.name} marginRight={2}>
                    <ContainerIcon state={container.state} />
                    <Text color="gray"> {container.service}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {ports && (
        <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={2} paddingY={1} marginTop={1}>
          <Box marginBottom={1}>
            <Text bold color="green">LOCAL DASHBOARDS & PORTS</Text>
          </Box>
          <Box flexDirection="row">
            <Box width={46} flexDirection="column">
              <Text color="white">  MinIO Console:    <Text color="cyan" underline>http://localhost:{ports.minioConsolePort}</Text></Text>
              <Text color="white">  Mailpit UI:       <Text color="cyan" underline>http://localhost:{ports.mailpitUiPort}</Text></Text>
            </Box>
            <Box width={46} flexDirection="column">
              <Text color="white">  SQLite Web:       <Text color="cyan" underline>http://localhost:{ports.sqliteWebPort}</Text></Text>
              <Text color="white">  Webhook Tester:   <Text color="cyan" underline>http://localhost:{ports.webhookTesterPort}</Text></Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
