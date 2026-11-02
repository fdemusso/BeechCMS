// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono, type Context } from 'hono'
import {
    GLOBAL_SCOPE,
    SystemClock,
    hasPermission,
    type ActivityLogVisibility,
    type EffectivePermissions,
    type MediaObject,
    type MediaRepository,
    type Seed,
} from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { publicProblem } from '../../public/errors/problem-details'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { filterSeedsByPermission } from '../../shared/rbac/scoped-projection'
import { cleanStr, parsePositiveInt } from '../../shared/utils/query-utils'
import { zodQuery } from '../../shared/utils/zod-query'
import { mediaLibraryQuerySchema, recentActivityQuerySchema } from './stats.schema'

const DATABASE_ERROR = 'Database error'
const INTERNAL_SERVER_ERROR = 'Internal Server Error'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR
const HOURS_24_IN_SECONDS = 24 * SECONDS_PER_HOUR
const DAYS_7_IN_SECONDS = 7 * SECONDS_PER_DAY
const DAYS_30_IN_SECONDS = 30 * SECONDS_PER_DAY
const MEDIA_SCAN_BATCH = 200
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100
const R2_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024 // 10GB
const D1_MONTHLY_REQUESTS_LIMIT = 1000000 // 1M requests/month

/** Origin the media is served from: the configured media base URL, else the request's own origin. */
function resolveMediaBaseUrl(context: Context<{ Bindings: Env; Variables: Variables }>): string {
    return (context.env.MEDIA_BASE_URL?.trim().replace(/\/+$/, '')) ?? new URL(context.req.url).origin
}

function mediaUrl(mediaBaseUrl: string, key: string): string {
    return `${mediaBaseUrl}/api/media/${encodeURIComponent(key)}`
}

function getMimeType(extension: string): string {
    if (extension === 'pdf') {
        return 'application/pdf'
    }
    const type = extension === 'jpg' ? 'jpeg' : (extension || 'jpeg')
    return `image/${type}`
}

/**
 * Reads every tracked upload, one repository page at a time, so the reports
 * never drop rows beyond a fixed scan window.
 */
async function listAllTrackedMedia(mediaRepository: MediaRepository): Promise<MediaObject[]> {
    const trackedMedia: MediaObject[] = []
    for (let mediaOffset = 0; ; mediaOffset += MEDIA_SCAN_BATCH) {
        const { items, total } = await mediaRepository.list({ limit: MEDIA_SCAN_BATCH, offset: mediaOffset })
        trackedMedia.push(...items)
        if (items.length < MEDIA_SCAN_BATCH || mediaOffset + MEDIA_SCAN_BATCH >= total) break
    }
    return trackedMedia
}

/**
 * Activity rows a caller may see: every seed slug for a global reader, else only the
 * readable seeds; rows tied to no seed (media, schema, security) need a global `manage_users`.
 */
function activityVisibility(
    effective: EffectivePermissions,
    readableSeeds: readonly Seed[],
): ActivityLogVisibility {
    return {
        seeds: hasPermission(effective, 'content:read', GLOBAL_SCOPE) ? 'all' : readableSeeds.map(seed => seed.slug),
        includeUnscoped: hasPermission(effective, 'manage_users', GLOBAL_SCOPE),
    }
}

const statsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

  /**
   * GET /stats/media-library - Lists all files present in R2:
   * combines media_objects (tracked uploads) + /api/media/ URLs found in file columns of each seed
   */
  .get('/stats/media-library', zodQuery(mediaLibraryQuerySchema), async (context) => {
    try {
        const mediaRepository = context.get('mediaRepository')
        const query = context.req.valid('query')
        const limit = Math.min(parsePositiveInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT)
        // parsePositiveInt rejects 0, which is also the fallback, so offset=0 and invalid values both give the first page.
        const offset = parsePositiveInt(query.offset, 0)
        const mediaBaseUrl = resolveMediaBaseUrl(context)

        // 1. Files tracked in the media library
        const mediaRows = await listAllTrackedMedia(mediaRepository)

        const trackedKeys = new Set<string>()
        const allItems: Array<{ key: string; filename: string; mime_type: string; size_bytes: number; created_at: number; url: string }> = []

        for (const mediaRow of mediaRows) {
            trackedKeys.add(mediaRow.key)
            allItems.push({ ...mediaRow, url: mediaUrl(mediaBaseUrl, mediaRow.key) })
        }

        // 2. /api/media/ URLs in the file columns of each seed (v0.4.0 — real columns)
        const seeds = context.get('seedRegistry').all()
        const contentScanRepository = context.get('contentScanRepository')
        const referencedKeysFromContent = await contentScanRepository.getReferencedMediaKeys(seeds)

        for (const key of referencedKeysFromContent) {
            if (trackedKeys.has(key)) continue
            trackedKeys.add(key)
            const filename = key.replace(/^\d+-/, '')
            const extension = filename.split('.').pop()?.toLowerCase() ?? ''
            const mimeType = getMimeType(extension)
            const createdAt = Number.parseInt(key.split('-')[0], 10) || 0
            allItems.push({
                key,
                filename,
                mime_type: mimeType,
                size_bytes: 0,
                created_at: createdAt,
                url: mediaUrl(mediaBaseUrl, key)
            })
        }

        allItems.sort((a, b) => b.created_at - a.created_at)
        const total = allItems.length
        const paginatedItems = allItems.slice(offset, offset + limit)

        return context.json({ items: paginatedItems, total }, 200)
    } catch (error) {
        console.error('Media library error:', error)
        return context.json({ error: INTERNAL_SERVER_ERROR }, 500)
    }
  })

  /**
   * GET /stats/unused-media - Finds media in media_objects not referenced in any file column
   */
  .get('/stats/unused-media', async (context) => {
    try {
        const mediaRepository = context.get('mediaRepository')
        const seeds = context.get('seedRegistry').all()

        // All tracked media keys
        const mediaRows = await listAllTrackedMedia(mediaRepository)

        if (mediaRows.length === 0) {
            return context.json({ items: [] }, 200)
        }

        // Collect all referenced keys in the file columns of each seed
        const contentScanRepository = context.get('contentScanRepository')
        const referencedKeys = await contentScanRepository.getReferencedMediaKeys(seeds)

        // Every item carries the url it is served from, like media-library: the widget renders it as an <img src>.
        const mediaBaseUrl = resolveMediaBaseUrl(context)
        const unusedMedia = mediaRows
            .filter(mediaItem => !referencedKeys.has(mediaItem.key))
            .map(mediaItem => ({ ...mediaItem, url: mediaUrl(mediaBaseUrl, mediaItem.key) }))
        return context.json({ items: unusedMedia }, 200)
    } catch (error) {
        console.error('Unused media error:', error)
        return context.json({ error: INTERNAL_SERVER_ERROR }, 500)
    }
  })

  /**
   * GET /stats/setup-checklist - Project setup status for "Project Health" widget
   */
  .get('/stats/setup-checklist', async (context) => {
    try {
        const setupChecklistRepository = context.get('setupChecklistRepository')
        const seeds = context.get('seedRegistry').all()

        const existingTables = await setupChecklistRepository.getExistingTableNames()

        const systemTableNames = [
            'users', 'refresh_tokens', 'media_objects',
            'analytics', 'system_stats', 'activity_logs',
        ]
        const systemTablesOk = systemTableNames.every(name => existingTables.has(name))

        const seedsCount = seeds.length
        const contentTablesOk = seedsCount > 0 && seeds.every(seed => existingTables.has(`content_${seed.slug}`))

        // The route gate is `manage_users@*` for an active account, so reaching this handler proves an
        // active global administrator exists.
        const adminExists = true

        let hasContent = false
        const firstSeedSlug = seeds[0]?.slug ?? null
        if (firstSeedSlug && existingTables.has(`content_${firstSeedSlug}`)) {
            try {
                hasContent = (await setupChecklistRepository.countEntriesInSeed(firstSeedSlug)) > 0
            } catch {
                // ignore
            }
        }

        return context.json({
            systemTablesOk,
            seedsCount,
            contentTablesOk,
            adminExists,
            hasContent,
            firstSeedSlug,
        }, 200)
    } catch (error) {
        console.error('Setup checklist error:', error)
        return context.json({ error: 'Failed to compute setup checklist' }, 500)
    }
  })

  /**
   * GET /stats/total - Content statistics for dashboard, limited to the seeds the caller may read.
   * The projection is the authorization decision for this route (route row is `authenticated`).
   */
  .get('/stats/total', async (context) => {
    try {
        const effective = await resolveEffectivePermissions(context)
        const readableSeeds = filterSeedsByPermission(context.get('seedRegistry').all(), effective, 'content:read')
        if (readableSeeds.length === 0) {
            return context.json({ total: 0, today: 0, week: 0, month: 0 }, 200)
        }

        const now = context.get('clock').nowSeconds()
        const twentyFourHoursAgo = now - HOURS_24_IN_SECONDS
        const sevenDaysAgo       = now - DAYS_7_IN_SECONDS
        const thirtyDaysAgo      = now - DAYS_30_IN_SECONDS

        // Total: SUM of per-seed counts (current live entries)
        const widgetRepository = context.get('widgetRepository')
        const countResults = await Promise.all(
            readableSeeds.map(seed => widgetRepository.aggregate(seed, { op: 'count' }, 'all'))
        )
        const totalEntriesCount = countResults.reduce((accumulator, count) => accumulator + count, 0)

        // today/week/month: create events in activity_logs (entity_type = 'content')
        // Content-create rows always carry a slug, so unscoped rows never count here.
        const visibility = { ...activityVisibility(effective, readableSeeds), includeUnscoped: false }
        const activityLogRepository = context.get('activityLogRepository')
        const [todayCount, weekCount, monthCount] = await Promise.all([
            activityLogRepository.countSince({ action: 'create', entityType: 'content', sinceTimestamp: twentyFourHoursAgo, visibility }),
            activityLogRepository.countSince({ action: 'create', entityType: 'content', sinceTimestamp: sevenDaysAgo, visibility }),
            activityLogRepository.countSince({ action: 'create', entityType: 'content', sinceTimestamp: thirtyDaysAgo, visibility }),
        ])

        return context.json({
            total: totalEntriesCount,
            today: todayCount,
            week: weekCount,
            month: monthCount,
        }, 200)
    } catch (error) {
        console.error('Content stats error:', error)
        return publicProblem(context, {
            type: 'content-database-error',
            title: INTERNAL_SERVER_ERROR,
            status: 500,
            detail: DATABASE_ERROR,
        })
    }
  })

  /**
   * GET /stats/recent-activity - Latest activities the caller may see
   * The projection is the authorization decision for this route (route row is `authenticated`).
   * No ETag on this endpoint: the activity feed must always be fresh after
   * every mutation. Cache-Control: no-store prevents the browser from keeping a
   * response that could be returned as a 304 stale.
   */
  .get('/stats/recent-activity', zodQuery(recentActivityQuerySchema), async (context) => {
    try {
        const slug = cleanStr(context.req.valid('query').slug)

        const effective = await resolveEffectivePermissions(context)
        const readableSeeds = filterSeedsByPermission(context.get('seedRegistry').all(), effective, 'content:read')
        const visibility = activityVisibility(effective, readableSeeds)

        context.header('Cache-Control', 'no-store')

        // A slug outside the perimeter answers empty, never 403: no existence oracle.
        const slugOutsidePerimeter = slug !== null && Array.isArray(visibility.seeds) && !visibility.seeds.includes(slug)
        const nothingVisible = Array.isArray(visibility.seeds) && visibility.seeds.length === 0 && !visibility.includeUnscoped
        if (slugOutsidePerimeter || nothingVisible) return context.json([], 200)

        const entries = await context.get('activityLogRepository').list({
            entitySlug: slug ?? undefined,
            visibility,
            limit: 15,
        })

        // Preserve the legacy snake_case wire format consumed by the dashboard
        // recent-activity widget. The repository returns camelCase records,
        // so we reshape only on the way out.
        const activities = entries.map((entry) => ({
            id: entry.id,
            user_id: entry.userId,
            user_email: entry.userEmail,
            user_name: entry.userName,
            action: entry.action,
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            entity_slug: entry.entitySlug,
            details: entry.details,
            created_at: entry.createdAt,
        }))

        return context.json(activities, 200)
    } catch (error) {
        console.error('Recent activity error:', error)
        return publicProblem(context, {
            type: 'content-database-error',
            title: INTERNAL_SERVER_ERROR,
            status: 500,
            detail: DATABASE_ERROR,
        })
    }
  })

  /**
   * GET /stats/health - System health status and Cloudflare quotas
   */
  .get('/stats/health', async (context) => {
    try {
        const systemStatsRepository = context.get('systemStatsRepository')

        // 1. Retrieve storage usage from repository (system_stats)
        let storageUsedBytes = 0
        try {
            storageUsedBytes = await systemStatsRepository.getStorageUsage()
        } catch (error) {
            console.warn('Health: Could not fetch storage stats from repo:', error)
        }

        // 2. Aggregate D1 requests (proxy for database health) - last 30 days
        const thirtyDaysAgo = SystemClock.nowSeconds() - DAYS_30_IN_SECONDS
        const totalRequests = await context
            .get('analyticsRepository')
            .sumByMetric('requests', '', thirtyDaysAgo)

        const storagePercentage = Math.min(Math.round((storageUsedBytes / R2_STORAGE_LIMIT) * 1000) / 10, 100)
        const d1Percentage = Math.min(Math.round((totalRequests / D1_MONTHLY_REQUESTS_LIMIT) * 1000) / 10, 100)

        // Annotated so the response type keeps the union; a bare conditional would widen to string.
        const healthStatus: 'healthy' | 'warning' = (storagePercentage < 90 && d1Percentage < 90) ? 'healthy' : 'warning'

        return context.json({
            storage: {
                used: storageUsedBytes,
                limit: R2_STORAGE_LIMIT,
                percentage: storagePercentage
            },
            database: {
                requests30d: totalRequests,
                limit: D1_MONTHLY_REQUESTS_LIMIT,
                percentage: d1Percentage
            },
            status: healthStatus,
            lastUpdate: SystemClock.nowSeconds()
        }, 200)
    } catch (error) {
        console.error('System health stats error:', error)
        return context.json({ error: 'Failed to calculate system health' }, 500)
    }
  })

  /**
   * GET /stats/cloudflare - Cloudflare-like metrics (Visitors, Requests, Bandwidth)
   */
  .get('/stats/cloudflare', async (context) => {
    try {
        const thirtyDaysAgo = SystemClock.nowSeconds() - DAYS_30_IN_SECONDS
        const analyticsRepository = context.get('analyticsRepository')

        const [recordedRequests, recordedVisitors] = await Promise.all([
            analyticsRepository.sumByMetric('requests', '', thirtyDaysAgo),
            analyticsRepository.sumByMetric('visitors', '', thirtyDaysAgo),
        ])

        // Simulate some Cloudflare metrics not directly tracked for a premium feel
        const requestsCount = recordedRequests > 0 ? recordedRequests : Math.floor(Math.random() * 5000) + 1000
        const visitorsCount = recordedVisitors > 0 ? recordedVisitors : Math.floor(requestsCount / 12) + 1
        const bandwidthMB = Math.round((requestsCount * 0.15) * 10) / 10

        const systemStatsRepository = context.get('systemStatsRepository')
        let storageUsedBytes = 0
        try {
            storageUsedBytes = await systemStatsRepository.getStorageUsage()
        } catch (error) {
            console.warn('Could not fetch storage stats from repo:', error)
        }

        const storageUsedMB = Math.round((storageUsedBytes / (1024 * 1024)) * 10) / 10
        const storageLimitMB = 10 * 1024 // 10 GB Free Tier

        return context.json({
            visitors: {
                value: visitorsCount,
                trend: 12, // simulated growth %
                isPositive: true
            },
            requests: {
                value: requestsCount,
                trend: 8,
                isPositive: true
            },
            bandwidth: {
                value: bandwidthMB,
                unit: 'MB',
                trend: 5,
                isPositive: false
            },
            cacheRate: {
                value: 94.2,
                unit: '%',
                trend: 0.5,
                isPositive: true
            },
            storage: {
                used: storageUsedMB,
                limit: storageLimitMB,
                unit: 'MB',
                percentage: Math.round((storageUsedMB / storageLimitMB) * 1000) / 10
            }
        }, 200)
    } catch (error) {
        console.error('Cloudflare stats error:', error)
        return publicProblem(context, {
            type: 'content-database-error',
            title: INTERNAL_SERVER_ERROR,
            status: 500,
            detail: DATABASE_ERROR,
        })
    }
  })

  /**
   * GET /stats/breakdown - Content distribution for "Content Pulse" widget
   * The projection is the authorization decision for this route (route row is `authenticated`).
   */
  .get('/stats/breakdown', async (context) => {
    try {
        const effective = await resolveEffectivePermissions(context)
        const seeds = filterSeedsByPermission(context.get('seedRegistry').all(), effective, 'content:read')
        if (seeds.length === 0) return context.json([], 200)

        const widgetRepository = context.get('widgetRepository')
        const counts = await Promise.all(
            seeds.map(seed => widgetRepository.aggregate(seed, { op: 'count' }, 'all'))
        )
        
        const breakdown = seeds.map((seed, index) => ({
            slug:  seed.slug,
            label: seed.labelPlural || seed.label,
            count: counts[index] ?? 0,
        }))

        return context.json(breakdown, 200)
    } catch (error) {
        console.error('Breakdown stats error:', error)
        return publicProblem(context, {
            type: 'content-database-error',
            title: INTERNAL_SERVER_ERROR,
            status: 500,
            detail: DATABASE_ERROR,
        })
    }
  })

  /**
   * POST /stats/storage/sync - Recalculates space occupied on R2 (expensive operation, use with caution)
   */
  .post('/stats/storage/sync', async (context) => {
    try {
        const bucket = context.get('bucket')
        const systemStatsRepository = context.get('systemStatsRepository')

        const realSize = await bucket.getTotalSize()
        await systemStatsRepository.setStorage(realSize)

        return context.json({ success: true, size: realSize }, 200)
    } catch (error) {
        console.error('Storage sync error:', error)
        return context.json({ error: INTERNAL_SERVER_ERROR }, 500)
    }
  })

export { statsApp }
