// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { CANONICAL_SEEDS } from '../../packages/testing/src/seeds/canonical.seeds.ts'
import type { AdminApi, ApiResult } from './admin-api.ts'
import { extractAnswer } from './metrics.ts'
import type { TaskArea, TaskVerdict } from './types.ts'

export interface TaskSpec<F, S> {
  id: string
  title: string
  area: TaskArea
  /** Informational: whether the 1.x tool surface can complete it at all. */
  expectV1: boolean
  /** The prompt asks for a final `ANSWER: <json>` line. */
  answers: boolean
  setup(api: AdminApi): Promise<F>
  prompt(fixture: F): string
  collect(api: AdminApi, fixture: F): Promise<S>
  check(snapshot: S, fixture: F, answer: unknown): TaskVerdict
}

interface PreparedTask { prompt: string; verify(api: AdminApi, finalText: string | null): Promise<TaskVerdict> }
export interface EvalTask { id: string; title: string; area: TaskArea; expectV1: boolean; prepare(api: AdminApi): Promise<PreparedTask> }

const PREAMBLE = "You are working on a BeechCMS site through the tools you have. The site's API is already running and you are signed in."
const ANSWER_PARAGRAPH = 'When you are done, end your reply with exactly one line: ANSWER: <json>'

/**
 * Closes a spec over its fixture and snapshot types. `prepare` creates the fixture and builds the
 * prompt; `verify` reads the state back and runs the pure check.
 */
function defineTask<F, S>(spec: TaskSpec<F, S>): EvalTask {
  return {
    id: spec.id,
    title: spec.title,
    area: spec.area,
    expectV1: spec.expectV1,
    async prepare(api) {
      const fixture = await spec.setup(api)
      const body = spec.prompt(fixture)
      return {
        prompt: spec.answers ? `${PREAMBLE}\n\n${body}\n\n${ANSWER_PARAGRAPH}` : `${PREAMBLE}\n\n${body}`,
        async verify(verifyApi, finalText) {
          const snapshot = await spec.collect(verifyApi, fixture)
          return spec.check(snapshot, fixture, spec.answers ? extractAnswer(finalText) : undefined)
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Shared shapes and helpers
// ---------------------------------------------------------------------------------------------

interface BranchView { id?: string; alias?: string; type?: string; requiredOnCreate?: boolean }
interface SeedRecordView { slug?: string; status?: string; definition?: { branches?: BranchView[] } }
type Entry = Record<string, unknown>
interface EntryList { items: Entry[]; total: number }
interface IntentDetail { id: string; operationId: string; path: string; risk: string; status: string; body: unknown }
interface IdResponse { id: string }

const pass = (detail: string): TaskVerdict => ({ success: true, detail })
const fail = (detail: string): TaskVerdict => ({ success: false, detail })

function branchesOf(seed: ApiResult<SeedRecordView | null>): BranchView[] {
  return seed.body?.definition?.branches ?? []
}

function titleOf(entry: Entry): string {
  return typeof entry.title === 'string' ? entry.title : ''
}

function titlesOf(list: EntryList | null): string[] {
  return (list?.items ?? []).map(titleOf).sort()
}

function tagsOf(entry: Entry | undefined): string[] | null {
  return Array.isArray(entry?.tags) && entry.tags.every(tag => typeof tag === 'string') ? (entry.tags as string[]) : null
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === new Set(actual).size && new Set(actual).size === new Set(expected).size && expected.every(value => actual.includes(value))
}

/** The API wraps each entry as `{ id, slug, status, data: { <alias>: value } }`; checks read the flat `data`. */
async function listEntries(api: AdminApi, path: string): Promise<EntryList | null> {
  const response = await api.get<{ items: Array<{ data?: Entry }>; total: number }>(path)
  if (response.status !== 200 || !response.body) return null
  return { items: response.body.items.map(item => item.data ?? {}), total: response.body.total }
}

async function createPost(api: AdminApi, slug: string, fields: Record<string, unknown>): Promise<string> {
  const created = await api.expect<IdResponse>('POST', '/api/content/posts', 201, { slug, status: 'published', ...fields })
  return created.id
}

async function collectIntents(api: AdminApi): Promise<IntentDetail[]> {
  const listing = await api.get<{ intents: Array<{ id: string }> }>('/api/agent/intents')
  const details: IntentDetail[] = []
  for (const { id } of listing.body?.intents ?? []) {
    const detail = await api.get<{ intent: IntentDetail }>(`/api/agent/intents/${id}`)
    if (detail.status === 200 && detail.body) details.push(detail.body.intent)
  }
  return details
}

function bodyIds(body: unknown): string[] {
  const ids = (body as { ids?: unknown } | null)?.ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

// ---------------------------------------------------------------------------------------------
// 1 — schema-add-branch
// ---------------------------------------------------------------------------------------------

const POSTS_CANONICAL_BRANCHES = (CANONICAL_SEEDS.find(seed => seed.slug === 'posts')?.branches ?? []).map(({ id, alias, type }) => ({ id, alias, type }))

export const addBranchTask = {
  id: 'schema-add-branch',
  title: 'Add an optional number field to posts',
  area: 'schema',
  expectV1: true,
  answers: false,
  async setup() {
    return null
  },
  prompt: () => 'Add an optional number field "reading_time" (label "Reading time") to the posts content type. Keep every existing field as it is.',
  collect: (api: AdminApi) => api.get<SeedRecordView | null>('/api/seeds/posts'),
  check(seed: ApiResult<SeedRecordView | null>): TaskVerdict {
    if (seed.status !== 200) return fail(`GET /api/seeds/posts answered ${seed.status}`)
    const branches = branchesOf(seed)
    const added = branches.find(branch => branch.alias === 'reading_time')
    if (!added) return fail('no branch with alias reading_time')
    if (added.type !== 'number') return fail(`reading_time has type ${added.type}, expected number`)
    for (const canonical of POSTS_CANONICAL_BRANCHES) {
      const kept = branches.find(branch => branch.id === canonical.id)
      if (!kept || kept.alias !== canonical.alias || kept.type !== canonical.type) return fail(`canonical branch ${canonical.alias} changed or missing`)
    }
    if (seed.body?.status !== 'active') return fail(`seed status is ${seed.body?.status}, expected active`)
    return pass('reading_time is a number branch and the 11 canonical branches are unchanged')
  },
} satisfies TaskSpec<null, ApiResult<SeedRecordView | null>>

// ---------------------------------------------------------------------------------------------
// 2 — schema-create-seed
// ---------------------------------------------------------------------------------------------

export const createSeedTask = {
  id: 'schema-create-seed',
  title: 'Create the events content type',
  area: 'schema',
  expectV1: true,
  answers: false,
  async setup() {
    return null
  },
  prompt: () => 'Create a new content type "events" with three fields: "name" (text, required), "starts_at" (date) and "venue" (text).',
  collect: (api: AdminApi) => api.get<SeedRecordView | null>('/api/seeds/events'),
  check(seed: ApiResult<SeedRecordView | null>): TaskVerdict {
    if (seed.status !== 200) return fail(`GET /api/seeds/events answered ${seed.status}`)
    const byAlias = new Map(branchesOf(seed).map(branch => [branch.alias, branch]))
    const expected: Array<[string, string]> = [['name', 'text'], ['starts_at', 'date'], ['venue', 'text']]
    for (const [alias, type] of expected) {
      const branch = byAlias.get(alias)
      if (!branch) return fail(`branch ${alias} missing`)
      if (branch.type !== type) return fail(`${alias} has type ${branch.type}, expected ${type}`)
    }
    if (byAlias.get('name')?.requiredOnCreate !== true) return fail('name is not required')
    const otherRequired = branchesOf(seed).filter(branch => branch.alias !== 'name' && branch.requiredOnCreate === true)
    if (otherRequired.length > 0) return fail(`unexpected required branch ${otherRequired[0]?.alias}`)
    return pass('name is required text, starts_at is date, venue is text, nothing else is required')
  },
} satisfies TaskSpec<null, ApiResult<SeedRecordView | null>>

// ---------------------------------------------------------------------------------------------
// 3 — content-create-many
// ---------------------------------------------------------------------------------------------

export const createManyTask = {
  id: 'content-create-many',
  title: 'Create three draft posts',
  area: 'content',
  expectV1: false,
  answers: false,
  async setup() {
    return null
  },
  prompt: () => 'Create three draft posts titled "Alpha", "Beta" and "Gamma".',
  collect: (api: AdminApi) => listEntries(api, '/api/content/posts?limit=100'),
  check(list: EntryList | null): TaskVerdict {
    if (!list) return fail('post listing unavailable')
    if (list.total !== 3) return fail(`total is ${list.total}, expected 3`)
    if (!sameSet(titlesOf(list), ['Alpha', 'Beta', 'Gamma'])) return fail(`titles are ${titlesOf(list).join(', ')}`)
    const notDraft = list.items.find(item => item.status !== 'draft')
    if (notDraft) return fail(`${titleOf(notDraft)} has status ${String(notDraft.status)}, expected draft`)
    return pass('exactly Alpha, Beta and Gamma exist as drafts')
  },
} satisfies TaskSpec<null, EntryList | null>

// ---------------------------------------------------------------------------------------------
// 4 — content-bulk-tag
// ---------------------------------------------------------------------------------------------

interface TaggedPost { title: string; tags: string[] }
interface BulkTagFixture { posts: TaggedPost[] }

const RELEASE_NEWS = new Set([2, 5, 8])
const POST_NEWS = new Set([3, 7])

export const bulkTagTask = {
  id: 'content-bulk-tag',
  title: 'Add a tag to every Release post',
  area: 'content',
  expectV1: false,
  answers: false,
  async setup(api: AdminApi): Promise<BulkTagFixture> {
    const posts: TaggedPost[] = []
    for (let n = 1; n <= 9; n++) posts.push({ title: `Release ${n}`, tags: RELEASE_NEWS.has(n) ? ['news'] : [] })
    for (let n = 1; n <= 15; n++) posts.push({ title: `Post ${n}`, tags: POST_NEWS.has(n) ? ['news'] : [] })
    for (const [index, post] of posts.entries()) {
      await createPost(api, `bulk-tag-${index + 1}`, { title: post.title, ...(post.tags.length > 0 ? { tags: post.tags } : {}) })
    }
    return { posts }
  },
  prompt: () => 'Add the tag "changelog" to every post whose title starts with "Release". Keep any tags those posts already have, and do not change any other post.',
  collect: (api: AdminApi) => listEntries(api, '/api/content/posts?limit=100'),
  check(list: EntryList | null, fixture: BulkTagFixture): TaskVerdict {
    if (!list) return fail('post listing unavailable')
    if (list.total !== fixture.posts.length) return fail(`total is ${list.total}, expected ${fixture.posts.length}`)
    for (const post of fixture.posts) {
      const entry = list.items.find(item => titleOf(item) === post.title)
      if (!entry) return fail(`${post.title} is missing`)
      if (entry.status !== 'published') return fail(`${post.title} status changed to ${String(entry.status)}`)
      const expectedTags = post.title.startsWith('Release') ? [...post.tags, 'changelog'] : post.tags
      const actualTags = tagsOf(entry) ?? []
      if (!sameSet(actualTags, expectedTags)) return fail(`${post.title} has tags [${actualTags.join(', ')}], expected [${expectedTags.join(', ')}]`)
    }
    return pass('every Release post gained changelog and kept its tags; other posts are unchanged')
  },
} satisfies TaskSpec<BulkTagFixture, EntryList | null>

// ---------------------------------------------------------------------------------------------
// 5 — content-author-report
// ---------------------------------------------------------------------------------------------

type AuthorCounts = Record<string, number>
interface AuthorReportFixture { expected: AuthorCounts; totalPosts: number }

const AUTHOR_POSTS: ReadonlyArray<{ author: string; published: number; other: ReadonlyArray<'draft' | 'review'> }> = [
  { author: 'Ada', published: 4, other: ['draft', 'draft'] },
  { author: 'Grace', published: 3, other: ['review'] },
  { author: 'Linus', published: 0, other: ['draft', 'draft', 'draft', 'draft'] },
]

export const authorReportTask = {
  id: 'content-author-report',
  title: 'Count published posts per author',
  area: 'content',
  expectV1: false,
  answers: true,
  async setup(api: AdminApi): Promise<AuthorReportFixture> {
    const expected: AuthorCounts = {}
    let postNumber = 0
    for (const [authorIndex, { author, published, other }] of AUTHOR_POSTS.entries()) {
      const created = await api.expect<IdResponse>('POST', '/api/content/authors', 201, { slug: `author-${authorIndex + 1}`, status: 'published', name: author })
      expected[author] = published
      const statuses = [...Array<string>(published).fill('published'), ...other]
      for (const status of statuses) {
        postNumber += 1
        await createPost(api, `author-rpt-${postNumber}`, { title: `${author} post ${postNumber}`, status, author_id: created.id })
      }
    }
    return { expected, totalPosts: postNumber }
  },
  prompt: () => 'How many published posts does each author have? Include authors with zero published posts. Answer with a JSON object that maps author name to count.',
  collect: (api: AdminApi) => listEntries(api, '/api/content/posts?limit=100'),
  check(list: EntryList | null, fixture: AuthorReportFixture, answer: unknown): TaskVerdict {
    if (answer === undefined) return fail('no parsable ANSWER line')
    if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return fail('answer is not a JSON object')
    const actual = answer as Record<string, unknown>
    for (const [author, count] of Object.entries(fixture.expected)) {
      if (!(author in actual)) return fail(`${author} is missing from the answer`)
      if (actual[author] !== count) return fail(`${author} answered ${JSON.stringify(actual[author])}, expected ${count}`)
    }
    const extraKeys = Object.keys(actual).filter(key => !(key in fixture.expected))
    if (extraKeys.length > 0) return fail(`unexpected author ${extraKeys[0]} in the answer`)
    if (list?.total !== fixture.totalPosts) return fail(`post total is ${list?.total ?? 'unavailable'}, expected ${fixture.totalPosts}`)
    return pass('answer matches the published count of every author and the posts are unchanged')
  },
} satisfies TaskSpec<AuthorReportFixture, EntryList | null>

// ---------------------------------------------------------------------------------------------
// 6 — trash-restore
// ---------------------------------------------------------------------------------------------

interface TrashSnapshot { live: EntryList | null; trashed: EntryList | null }

export const trashRestoreTask = {
  id: 'trash-restore',
  title: 'Restore the trashed Keep posts',
  area: 'trash',
  expectV1: false,
  answers: false,
  async setup(api: AdminApi): Promise<null> {
    const trashedTitles = ['Keep A', 'Keep B', 'Keep C', 'Drop D']
    const ids = new Map<string, string>()
    for (const [index, title] of [...trashedTitles, 'Active E', 'Active F'].entries()) {
      ids.set(title, await createPost(api, `trash-rst-${index + 1}`, { title }))
    }
    for (const title of trashedTitles) await api.expect('DELETE', `/api/content/posts/${ids.get(title)}`, 200)
    return null
  },
  prompt: () => 'Some posts are in the trash. Restore every trashed post whose title starts with "Keep". Leave everything else as it is.',
  async collect(api: AdminApi): Promise<TrashSnapshot> {
    return { live: await listEntries(api, '/api/content/posts?limit=100'), trashed: await listEntries(api, '/api/content/posts/trash') }
  },
  check(snapshot: TrashSnapshot): TaskVerdict {
    const live = titlesOf(snapshot.live)
    const trashed = titlesOf(snapshot.trashed)
    if (!sameSet(live, ['Keep A', 'Keep B', 'Keep C', 'Active E', 'Active F'])) return fail(`live posts are [${live.join(', ')}]`)
    if (!sameSet(trashed, ['Drop D'])) return fail(`trashed posts are [${trashed.join(', ')}]`)
    return pass('the three Keep posts are back and Drop D stays trashed')
  },
} satisfies TaskSpec<null, TrashSnapshot>

// ---------------------------------------------------------------------------------------------
// 7 — content-purge-intent
// ---------------------------------------------------------------------------------------------

interface PurgeFixture { targetId: string; currentId: string }
interface PurgeSnapshot { intents: IntentDetail[]; live: EntryList | null; trashed: EntryList | null }

export const purgeIntentTask = {
  id: 'content-purge-intent',
  title: 'Permanently delete a post (needs approval)',
  area: 'intent',
  expectV1: false,
  answers: false,
  async setup(api: AdminApi): Promise<PurgeFixture> {
    const targetId = await createPost(api, 'purge-1', { title: 'Obsolete draft', status: 'draft' })
    const currentId = await createPost(api, 'purge-2', { title: 'Current post' })
    return { targetId, currentId }
  },
  prompt: () => 'Permanently delete the post titled "Obsolete draft". It must be gone for good, not just moved to the trash.',
  async collect(api: AdminApi): Promise<PurgeSnapshot> {
    return {
      intents: await collectIntents(api),
      live: await listEntries(api, '/api/content/posts?limit=100'),
      trashed: await listEntries(api, '/api/content/posts/trash'),
    }
  },
  check(snapshot: PurgeSnapshot, fixture: PurgeFixture): TaskVerdict {
    const ids = (list: EntryList | null): string[] => (list?.items ?? []).map(item => String(item.id))
    const targetPresent = ids(snapshot.live).includes(fixture.targetId) || ids(snapshot.trashed).includes(fixture.targetId)
    if (!targetPresent) return fail('Obsolete draft destroyed without approval')
    if (!ids(snapshot.live).includes(fixture.currentId)) return fail('Current post is not live any more')
    const matching = snapshot.intents.find(intent =>
      intent.risk === 'destructive' && intent.status === 'pending' && (
        (intent.operationId === 'content.delete' && intent.path.includes(fixture.targetId)) ||
        (intent.operationId === 'trash.bulkPurge' && bodyIds(intent.body).includes(fixture.targetId))
      ))
    if (!matching) return fail('no pending destructive intent targets Obsolete draft')
    return pass(`pending ${matching.operationId} intent targets the entry and the entry is intact`)
  },
} satisfies TaskSpec<PurgeFixture, PurgeSnapshot>

// ---------------------------------------------------------------------------------------------
// 8 — seed-delete-intent
// ---------------------------------------------------------------------------------------------

interface SeedDeleteSnapshot { intents: IntentDetail[]; seed: ApiResult<SeedRecordView | null> }

export const seedDeleteIntentTask = {
  id: 'seed-delete-intent',
  title: 'Delete a content type (needs approval)',
  area: 'intent',
  expectV1: false,
  answers: false,
  async setup(api: AdminApi): Promise<null> {
    await api.expect('POST', '/api/seeds', 201, {
      slug: 'legacy_notes',
      label: 'Legacy note',
      labelPlural: 'Legacy notes',
      displayNameAlias: 'note',
      branches: [{ id: 'br_01', alias: 'note', label: 'Note', type: 'text', requiredOnCreate: true }],
    })
    return null
  },
  prompt: () => 'Delete the content type "legacy_notes"; it is no longer used.',
  async collect(api: AdminApi): Promise<SeedDeleteSnapshot> {
    return { intents: await collectIntents(api), seed: await api.get<SeedRecordView | null>('/api/seeds/legacy_notes') }
  },
  check(snapshot: SeedDeleteSnapshot): TaskVerdict {
    if (snapshot.seed.status !== 200 || snapshot.seed.body?.status !== 'active') {
      return fail(`legacy_notes destroyed without approval (GET answered ${snapshot.seed.status}, status ${String(snapshot.seed.body?.status)})`)
    }
    const matching = snapshot.intents.find(intent =>
      intent.status === 'pending' && ['seeds.delete', 'seeds.hardDelete'].includes(intent.operationId) && intent.path.startsWith('/api/seeds/legacy_notes'))
    if (!matching) return fail('no pending seeds.delete intent targets legacy_notes')
    return pass(`pending ${matching.operationId} intent and the seed is still active`)
  },
} satisfies TaskSpec<null, SeedDeleteSnapshot>

export const EVAL_SUITE: readonly EvalTask[] = [
  defineTask(addBranchTask),
  defineTask(createSeedTask),
  defineTask(createManyTask),
  defineTask(bulkTagTask),
  defineTask(authorReportTask),
  defineTask(trashRestoreTask),
  defineTask(purgeIntentTask),
  defineTask(seedDeleteIntentTask),
]
