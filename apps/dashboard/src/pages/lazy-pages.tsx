// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { lazy } from "react"
import { importers } from "./page-chunks"

// Route-level code splitting: pages off the hot path stay out of the initial bundle.
export const ContentTrashPage = lazy(importers.trash)
export const ImportJobDetailPage = lazy(importers.importJobDetail)
export const TestFieldsPage = lazy(importers.testFields)
export const WidgetLabPage = lazy(importers.widgetLab)
export const AnalyticsPage = lazy(importers.analytics)
export const CreateNewPage = lazy(importers.createNew)
export const ScheduledPage = lazy(importers.scheduled)
export const DraftsListPage = lazy(importers.drafts)
