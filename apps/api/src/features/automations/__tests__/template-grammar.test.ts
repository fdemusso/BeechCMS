import { describe, it, expect } from 'vitest'
import { parseTemplateKey } from '../template-grammar'
import type { ParsedKey } from '../template-grammar'

describe('parseTemplateKey', () => {
  describe('simple keys', () => {
    it('returns simple for a plain field name', () => {
      expect(parseTemplateKey('title')).toEqual<ParsedKey>({ kind: 'simple', path: 'title' })
    })

    it('returns simple for a dot-path', () => {
      expect(parseTemplateKey('author.name')).toEqual<ParsedKey>({ kind: 'simple', path: 'author.name' })
    })

    it('returns simple for _count (legacy)', () => {
      expect(parseTemplateKey('_count')).toEqual<ParsedKey>({ kind: 'simple', path: '_count' })
    })

    it('returns null for empty string', () => {
      expect(parseTemplateKey('')).toBeNull()
    })
  })

  describe('two-token sugar: <scope>:<field>', () => {
    it('defaults to lastone selector for <seedSlug>:<field>', () => {
      expect(parseTemplateKey('customers:email')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'customers',
        selector: { kind: 'lastone' },
        op: 'field',
        field: 'email',
      })
    })

    it('defaults to lastone selector for this:<field>', () => {
      expect(parseTemplateKey('this:email')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'this',
        selector: { kind: 'lastone' },
        op: 'field',
        field: 'email',
      })
    })

    it('sugar: batch:count → batch:all:count', () => {
      expect(parseTemplateKey('batch:count')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'batch',
        selector: { kind: 'all' },
        op: 'count',
        field: null,
      })
    })

    it('sugar: customers:sum → customers:all:sum (aggregate sugar without subfield)', () => {
      const result = parseTemplateKey('customers:sum')
      expect(result).toMatchObject({ kind: 'scoped', scope: 'customers', selector: { kind: 'all' }, op: 'sum' })
    })
  })

  describe('three-token: <scope>:<selector>:<field>', () => {
    it('lastone selector', () => {
      expect(parseTemplateKey('customers:lastone:email')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'customers',
        selector: { kind: 'lastone' },
        op: 'field',
        field: 'email',
      })
    })

    it('firstone selector', () => {
      expect(parseTemplateKey('customers:firstone:name')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'customers',
        selector: { kind: 'firstone' },
        op: 'field',
        field: 'name',
      })
    })

    it('byid selector', () => {
      expect(parseTemplateKey('customers:byid(c_42):name')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'customers',
        selector: { kind: 'byid', id: 'c_42' },
        op: 'field',
        field: 'name',
      })
    })

    it('where selector', () => {
      expect(parseTemplateKey('orders:where(status=paid):total')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'orders',
        selector: { kind: 'where', alias: 'status', value: 'paid' },
        op: 'field',
        field: 'total',
      })
    })

    it('all:count aggregate', () => {
      expect(parseTemplateKey('orders:all:count')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'orders',
        selector: { kind: 'all' },
        op: 'count',
        field: null,
      })
    })

    it('all:sum:<subfield> aggregate', () => {
      expect(parseTemplateKey('orders:all:sum:total')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'orders',
        selector: { kind: 'all' },
        op: 'sum',
        field: 'total',
      })
    })

    it('all:avg aggregate', () => {
      expect(parseTemplateKey('orders:all:avg:amount')).toMatchObject({
        kind: 'scoped', scope: 'orders', op: 'avg', field: 'amount',
      })
    })

    it('all:min aggregate', () => {
      expect(parseTemplateKey('orders:all:min:price')).toMatchObject({
        kind: 'scoped', scope: 'orders', op: 'min', field: 'price',
      })
    })

    it('all:max aggregate', () => {
      expect(parseTemplateKey('orders:all:max:score')).toMatchObject({
        kind: 'scoped', scope: 'orders', op: 'max', field: 'score',
      })
    })

    it('all:pluck:<subfield> aggregate', () => {
      expect(parseTemplateKey('customers:all:pluck:email')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'customers',
        selector: { kind: 'all' },
        op: 'pluck',
        field: 'email',
      })
    })

    it('batch:all:count', () => {
      expect(parseTemplateKey('batch:all:count')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'batch',
        selector: { kind: 'all' },
        op: 'count',
        field: null,
      })
    })

    it('batch:all:pluck:email', () => {
      expect(parseTemplateKey('batch:all:pluck:email')).toMatchObject({
        kind: 'scoped', scope: 'batch', op: 'pluck', field: 'email',
      })
    })
  })

  describe('rejection rules', () => {
    it('returns null when aggregate used without all selector', () => {
      expect(parseTemplateKey('orders:lastone:sum')).toBeNull()
    })

    it('returns null when selector token is unrecognised', () => {
      expect(parseTemplateKey('orders:unknown:field')).toBeNull()
    })

    it('returns null when there are no field tokens after selector', () => {
      expect(parseTemplateKey('orders:lastone')).toEqual<ParsedKey>({
        kind: 'scoped',
        scope: 'orders',
        selector: { kind: 'lastone' },
        op: 'field',
        field: 'lastone',
      })
    })

    it('colons inside parens do not split tokens', () => {
      const result = parseTemplateKey('customers:byid(ns:id-123):name')
      expect(result).toMatchObject({
        kind: 'scoped',
        scope: 'customers',
        selector: { kind: 'byid', id: 'ns:id-123' },
        op: 'field',
        field: 'name',
      })
    })
  })

  describe('scoped with this scope', () => {
    it('this:lastone:field', () => {
      expect(parseTemplateKey('this:lastone:name')).toMatchObject({
        kind: 'scoped', scope: 'this', selector: { kind: 'lastone' }, op: 'field', field: 'name',
      })
    })
  })
})
