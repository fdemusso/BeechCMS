import { describe, it, expect, vi } from 'vitest'
import { Context } from 'hono'
import { EntryNotFoundError, SlugConflictError, HookValidationError } from '@beechcms/core'
import { normalizeBody, contentValidationProblem, logContentActivity, dispatchContentAutomation, handleContentDatabaseError } from './helpers'
import { CONTENT_ERRORS } from '../constants'

// Mock dependencies
vi.mock('../../../public/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
  fkProblemOrNull: vi.fn((_ctx, err, method) => {
    if (err instanceof Error && err.message === 'FK_ERROR') return { mockFkProblem: true }
    return null
  }),
}))

describe('content handlers helpers', () => {
  describe('normalizeBody', () => {
    it('returns the object when input is an object', () => {
      const obj = { a: 1 }
      expect(normalizeBody(obj)).toBe(obj)
    })

    it('returns an empty object when input is null', () => {
      expect(normalizeBody(null)).toEqual({})
    })

    it('returns an empty object when input is a primitive', () => {
      expect(normalizeBody('string')).toEqual({})
      expect(normalizeBody(123)).toEqual({})
      expect(normalizeBody(true)).toEqual({})
    })
  })

  describe('contentValidationProblem', () => {
    it('calls publicProblem with correct parameters', () => {
      const ctx = {} as Context
      const errors = [{ field: 'title', expected: 'string', received: 'number', message: 'Wrong type' }]
      const result = contentValidationProblem(ctx, errors)
      
      expect(result).toEqual({
        mockProblem: true,
        type: 'content-validation-failed',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors,
      })
    })
  })

  describe('logContentActivity', () => {
    it('logs activity with correct payload', () => {
      const mockLog = vi.fn()
      const ctx = {
        get: vi.fn((key) => {
          if (key === 'jwtPayload') return { sub: 'user-1', email: 'test@test.com', name: 'John', surname: 'Doe' }
          if (key === 'activityLogger') return { log: mockLog }
        })
      } as unknown as Context<any>

      logContentActivity(ctx, 'create', 'entry-1', 'test-slug', 'Test Title')

      expect(mockLog).toHaveBeenCalledWith({
        action: 'create',
        entityType: 'content',
        entityId: 'entry-1',
        entitySlug: 'test-slug',
        details: { title: 'Test Title' },
        actor: {
          id: 'user-1',
          email: 'test@test.com',
          name: 'John Doe',
        },
      })
    })

    it('handles missing name and surname', () => {
      const mockLog = vi.fn()
      const ctx = {
        get: vi.fn((key) => {
          if (key === 'jwtPayload') return { sub: 'user-1' } // Missing name, surname, email
          if (key === 'activityLogger') return { log: mockLog }
        })
      } as unknown as Context<any>

      logContentActivity(ctx, 'update', 'entry-1', 'test-slug', 'Test Title')

      expect(mockLog).toHaveBeenCalledWith({
        action: 'update',
        entityType: 'content',
        entityId: 'entry-1',
        entitySlug: 'test-slug',
        details: { title: 'Test Title' },
        actor: {
          id: 'user-1',
          email: 'unknown',
          name: null,
        },
      })
    })
  })

  describe('dispatchContentAutomation', () => {
    it('schedules automation run', () => {
      const mockWaitUntil = vi.fn()
      const mockRun = vi.fn().mockReturnValue('mock-promise')
      const ctx = {
        get: vi.fn((key) => {
          if (key === 'scheduler') return { waitUntil: mockWaitUntil }
          if (key === 'automationRunner') return { run: mockRun }
        })
      } as unknown as Context<any>

      const entry = { id: 1 }
      dispatchContentAutomation(ctx, 'posts', 'create', entry)

      expect(mockRun).toHaveBeenCalledWith({
        seedSlug: 'posts',
        event: 'create',
        entry,
      })
      expect(mockWaitUntil).toHaveBeenCalledWith('mock-promise')
    })
  })

  describe('handleContentDatabaseError', () => {
    it('handles EntryNotFoundError', () => {
      const ctx = {} as Context<any>
      const error = new EntryNotFoundError('Not found')
      const result = handleContentDatabaseError(ctx, error)

      expect(result).toEqual({
        mockProblem: true,
        type: 'content-not-found',
        title: 'Not Found',
        status: 404,
        detail: CONTENT_ERRORS.NOT_FOUND,
      })
    })

    it('handles SlugConflictError', () => {
      const ctx = {} as Context<any>
      const error = new SlugConflictError('Conflict')
      const result = handleContentDatabaseError(ctx, error)

      expect(result).toEqual({
        mockProblem: true,
        type: 'content-slug-conflict',
        title: 'Conflict',
        status: 409,
        detail: CONTENT_ERRORS.SLUG_CONFLICT,
      })
    })

    it('handles HookValidationError with field details', () => {
      const ctx = {} as Context<any>
      const error = new HookValidationError('Hook failed', [{ field: 'title', message: 'Too short' }])
      const result = handleContentDatabaseError(ctx, error)

      expect(result).toEqual({
        mockProblem: true,
        type: 'content-hook-validation-failed',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Hook failed',
        errors: [{ field: 'title', expected: '', received: '', message: 'Too short' }],
      })
    })

    it('handles HookValidationError without field details', () => {
      const ctx = {} as Context<any>
      const error = new HookValidationError('Hook failed')
      const result = handleContentDatabaseError(ctx, error)

      expect(result).toEqual({
        mockProblem: true,
        type: 'content-hook-validation-failed',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Hook failed',
        errors: [],
      })
    })

    it('handles foreign key error', () => {
      const ctx = { req: { method: 'POST' } } as unknown as Context<any>
      const error = new Error('FK_ERROR')
      const result = handleContentDatabaseError(ctx, error)

      expect(result).toEqual({ mockFkProblem: true })
    })

    it('handles generic errors as 500', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const ctx = { req: { method: 'POST' } } as unknown as Context<any>
      const error = new Error('Some db error')
      const result = handleContentDatabaseError(ctx, error)

      expect(result).toEqual({
        mockProblem: true,
        type: 'content-database-error',
        title: 'Internal Server Error',
        status: 500,
        detail: CONTENT_ERRORS.DATABASE_ERROR,
      })
      expect(consoleSpy).toHaveBeenCalledWith('Content database error:', error)
      consoleSpy.mockRestore()
    })
  })
})
