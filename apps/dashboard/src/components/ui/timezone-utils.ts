export const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [
      'Europe/Rome',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Australia/Sydney',
    ]
  }
})()

const tzFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getTzFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = tzFormatterCache.get(tz)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    tzFormatterCache.set(tz, formatter)
  }
  return formatter
}

export function getTimezoneLabel(tz: string): string {
  try {
    const parts = getTzFormatter(tz).formatToParts(new Date())
    const tzPart = parts.find((part) => part.type === 'timeZoneName')
    const offset = tzPart ? tzPart.value.replace('GMT', 'UTC') : ''

    const tzParts = tz.split('/')
    const city = tzParts[tzParts.length - 1].replace('_', ' ')
    const region = tzParts.slice(0, -1).join('/')

    if (region) {
      return `${city} (${region}, ${offset})`
    }
    return offset ? `${city} (${offset})` : city
  } catch {
    return tz
  }
}
