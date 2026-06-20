import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const licensePath = resolve(ROOT, '.github/LICENSE')
let licenseContent = readFileSync(licensePath, 'utf8')

const changeDate = new Date()
changeDate.setFullYear(changeDate.getFullYear() + 4)
const changeDateStr = changeDate.toISOString().split('T')[0]

const newContent = licenseContent.replace(/Change Date:\s+\d{4}-\d{2}-\d{2}/, `Change Date:          ${changeDateStr}`)

if (licenseContent !== newContent) {
  writeFileSync(licensePath, newContent, 'utf8')
  console.log(`LICENSE Change Date updated to ${changeDateStr}`)
}
