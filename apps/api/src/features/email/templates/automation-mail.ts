import type { AutomationMailParams } from '../email.types'

/** Identity builder: automation payloads are already user-authored. */
export function buildAutomationEmail(params: AutomationMailParams) {
  return {
    to: params.to,
    subject: params.subject,
    html: params.body,
    text: stripHtml(params.body),
  }
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').trim()
}
