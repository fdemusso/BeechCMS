import pc from 'picocolors'

export async function mailpitClear(): Promise<void> {
  console.log(pc.cyan('\n  beech mailpit:clear — clear test emails\n'))

  try {
    const res = await fetch('http://localhost:8025/api/v1/messages', {
      method: 'DELETE',
    })

    if (res.ok) {
      console.log(pc.green('  ✓ Mailpit inbox cleared successfully.'))
    } else {
      console.log(pc.red(`  ✗ Failed to clear Mailpit inbox: ${res.statusText}`))
      process.exit(1)
      return
    }
  } catch (err: any) {
    console.log(pc.red(`  ✗ Error connecting to Mailpit: ${err.message}`))
    console.log(pc.dim('    Make sure Mailpit is running (default port 8025).'))
    process.exit(1)
    return
  }
}
