import { describe, it, expect } from 'vitest'
import { cronMatches } from '../cron-runner.utils'

const ts = (iso: string) => new Date(iso).getTime()

describe('cronMatches', () => {
  it('matches any timestamp with * * * * *', () => {
    expect(cronMatches('* * * * *', ts('2026-05-14T09:37:00Z'))).toBe(true)
  })

  it('returns false for null', () => {
    expect(cronMatches(null, ts('2026-05-14T09:00:00Z'))).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(cronMatches('', ts('2026-05-14T09:00:00Z'))).toBe(false)
  })

  it('returns false for malformed (not 5 fields)', () => {
    expect(cronMatches('* * * *', ts('2026-05-14T09:00:00Z'))).toBe(false)
    expect(cronMatches('* * * * * *', ts('2026-05-14T09:00:00Z'))).toBe(false)
  })

  describe('exact match', () => {
    it('matches 0 9 * * * at 09:00', () => {
      expect(cronMatches('0 9 * * *', ts('2026-05-14T09:00:00Z'))).toBe(true)
    })

    it('does not match 0 9 * * * at 09:01', () => {
      expect(cronMatches('0 9 * * *', ts('2026-05-14T09:01:00Z'))).toBe(false)
    })
  })

  describe('day-of-week', () => {
    // 2026-05-11 is a Monday (day 1)
    it('matches 0 9 * * 1 on Monday', () => {
      expect(cronMatches('0 9 * * 1', ts('2026-05-11T09:00:00Z'))).toBe(true)
    })

    it('does not match 0 9 * * 1 on Tuesday', () => {
      expect(cronMatches('0 9 * * 1', ts('2026-05-12T09:00:00Z'))).toBe(false)
    })
  })

  describe('list', () => {
    it('matches 0 9,17 * * * at 09:00', () => {
      expect(cronMatches('0 9,17 * * *', ts('2026-05-14T09:00:00Z'))).toBe(true)
    })

    it('matches 0 9,17 * * * at 17:00', () => {
      expect(cronMatches('0 9,17 * * *', ts('2026-05-14T17:00:00Z'))).toBe(true)
    })

    it('does not match 0 9,17 * * * at 10:00', () => {
      expect(cronMatches('0 9,17 * * *', ts('2026-05-14T10:00:00Z'))).toBe(false)
    })
  })

  describe('range', () => {
    it('matches 0 9-11 * * * at 09:00', () => {
      expect(cronMatches('0 9-11 * * *', ts('2026-05-14T09:00:00Z'))).toBe(true)
    })

    it('matches 0 9-11 * * * at 10:00', () => {
      expect(cronMatches('0 9-11 * * *', ts('2026-05-14T10:00:00Z'))).toBe(true)
    })

    it('matches 0 9-11 * * * at 11:00', () => {
      expect(cronMatches('0 9-11 * * *', ts('2026-05-14T11:00:00Z'))).toBe(true)
    })

    it('does not match 0 9-11 * * * at 12:00', () => {
      expect(cronMatches('0 9-11 * * *', ts('2026-05-14T12:00:00Z'))).toBe(false)
    })
  })

  describe('step', () => {
    it('matches */15 * * * * at :00', () => {
      expect(cronMatches('*/15 * * * *', ts('2026-05-14T09:00:00Z'))).toBe(true)
    })

    it('matches */15 * * * * at :15', () => {
      expect(cronMatches('*/15 * * * *', ts('2026-05-14T09:15:00Z'))).toBe(true)
    })

    it('matches */15 * * * * at :30', () => {
      expect(cronMatches('*/15 * * * *', ts('2026-05-14T09:30:00Z'))).toBe(true)
    })

    it('matches */15 * * * * at :45', () => {
      expect(cronMatches('*/15 * * * *', ts('2026-05-14T09:45:00Z'))).toBe(true)
    })

    it('does not match */15 * * * * at :07', () => {
      expect(cronMatches('*/15 * * * *', ts('2026-05-14T09:07:00Z'))).toBe(false)
    })
  })

  describe('range + step', () => {
    it('matches 5-30/5 * * * * at :05', () => {
      expect(cronMatches('5-30/5 * * * *', ts('2026-05-14T09:05:00Z'))).toBe(true)
    })

    it('matches 5-30/5 * * * * at :10', () => {
      expect(cronMatches('5-30/5 * * * *', ts('2026-05-14T09:10:00Z'))).toBe(true)
    })

    it('matches 5-30/5 * * * * at :30', () => {
      expect(cronMatches('5-30/5 * * * *', ts('2026-05-14T09:30:00Z'))).toBe(true)
    })

    it('does not match 5-30/5 * * * * at :00', () => {
      expect(cronMatches('5-30/5 * * * *', ts('2026-05-14T09:00:00Z'))).toBe(false)
    })

    it('does not match 5-30/5 * * * * at :35', () => {
      expect(cronMatches('5-30/5 * * * *', ts('2026-05-14T09:35:00Z'))).toBe(false)
    })
  })
})
