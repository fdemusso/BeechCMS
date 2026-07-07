// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import type { Branch, FormLayout, Seed } from "@beechcms/core"

/**
 * Stable virtual branch ids for the meta-seed `_seed`. Private to the hook —
 * never persisted, never sent to the API. They only need to be stable enough
 * for the hand-built FormLayout (below) to reference them by `branch.id`,
 * the engine invariant LayoutRenderer relies on.
 */
export const META = {
  slug: "br_meta_slug",
  label: "br_meta_label",
  labelPlural: "br_meta_label_plural",
  displayNameAlias: "br_meta_display",
  allowPublicRead: "br_meta_pub_read",
  allowPublicPost: "br_meta_pub_post",
  allowPublicEdit: "br_meta_pub_edit",
  allowDrafts: "br_meta_drafts",
  branches: "br_meta_branches",
  dashIcon: "br_meta_dash_icon",
  dashGroup: "br_meta_dash_group",
  dashOrder: "br_meta_dash_order",
  dashHidden: "br_meta_dash_hidden",
  dashDescription: "br_meta_dash_desc",
  dashViewGallery: "br_meta_dash_view_gallery",
  dashViewKanban: "br_meta_dash_view_kanban",
} as const

export interface BuildMetaBranchesOptions {
  isEdit: boolean
  branchAliasOptions: string[]
  activeSeedsForRelation: Seed[]
  iconNames: string[]
}

export function buildMetaBranches(t: TFunction, opts: BuildMetaBranchesOptions): Branch[] {
  return [
    {
      id: META.slug, alias: "slug", label: t("seedBuilder.editor.slug"),
      hint: t("seedBuilder.editor.hints.slug"),
      type: "text", requiredOnCreate: true,
      // The slug is the table name — immutable once created (sprint 03 rejects changes).
      // TextEdit honours the `readOnly` option via a cast, mirroring the repeater's
      // `repeater` meta cast — neither is part of the persisted Branch shape.
      ...(opts.isEdit ? { readOnly: true } : {}),
    } as Branch,
    { id: META.label, alias: "label", label: t("seedBuilder.editor.label"),
      type: "text", requiredOnCreate: true },
    { id: META.labelPlural, alias: "label_plural", label: t("seedBuilder.editor.labelPlural"),
      type: "text" },
    {
      id: META.displayNameAlias, alias: "display_name_alias",
      label: t("seedBuilder.editor.displayNameAlias"),
      hint: t("seedBuilder.editor.hints.displayNameAlias"),
      type: "select" as Branch["type"], requiredOnCreate: true,
      options: opts.branchAliasOptions,
    } as Branch,
    { id: META.allowPublicRead, alias: "allow_public_read",
      label: t("seedBuilder.editor.allowPublicRead"),
      hint: t("seedBuilder.editor.hints.allowPublicRead"),
      type: "boolean" },
    { id: META.allowPublicPost, alias: "allow_public_post",
      label: t("seedBuilder.editor.allowPublicPost"),
      hint: t("seedBuilder.editor.hints.allowPublicPost"),
      type: "boolean" },
    { id: META.allowPublicEdit, alias: "allow_public_edit",
      label: t("seedBuilder.editor.allowPublicEdit"),
      hint: t("seedBuilder.editor.hints.allowPublicEdit"),
      type: "boolean" },
    { id: META.allowDrafts, alias: "allow_drafts",
      label: t("seedBuilder.editor.allowDrafts"),
      hint: t("seedBuilder.editor.hints.allowDrafts"),
      type: "boolean" },
    // THE repeater: the branches list. Item body = Branch (sprint 08 BranchItemRow).
    {
      id: META.branches, alias: "branches", label: t("seedBuilder.editor.tabFields"),
      type: "repeater" as Branch["type"],
      repeater: {
        itemKind: "branch",
        itemLabel: t("seedBuilder.branchEditor.addField"),
        branchItemContext: { activeSeedsForRelation: opts.activeSeedsForRelation },
      },
    } as Branch,
    { id: META.dashIcon, alias: "dash_icon", label: t("seedBuilder.editor.dashIcon"),
      type: "select" as Branch["type"], options: opts.iconNames },
    { id: META.dashGroup, alias: "dash_group", label: t("seedBuilder.editor.dashGroup"),
      hint: t("seedBuilder.editor.hints.dashGroup"),
      type: "text" },
    { id: META.dashOrder, alias: "dash_order", label: t("seedBuilder.editor.dashOrder"),
      hint: t("seedBuilder.editor.hints.dashOrder"),
      type: "number" },
    { id: META.dashHidden, alias: "dash_hidden", label: t("seedBuilder.editor.dashHidden"),
      type: "boolean" },
    { id: META.dashDescription, alias: "dash_description",
      label: t("seedBuilder.editor.dashDescription"),
      hint: t("seedBuilder.editor.hints.dashDescription"),
      type: "text" },
    { id: META.dashViewGallery, alias: "dash_view_gallery",
      label: t("seedBuilder.editor.dashViewGallery", { defaultValue: "Enable Gallery view" }),
      type: "boolean" },
    { id: META.dashViewKanban, alias: "dash_view_kanban",
      label: t("seedBuilder.editor.dashViewKanban", { defaultValue: "Enable Kanban view" }),
      type: "boolean" },
  ]
}

export function buildMetaLayout(t: TFunction): FormLayout {
  return {
    version: 1,
    tabs: [
      {
        id: "general",
        label: t("seedBuilder.editor.tabGeneral"),
        sections: [
          {
            id: "general-identity",
            columns: [
              { id: "general-identity-c1", fields: [{ branchId: META.slug }] },
              { id: "general-identity-c2", fields: [{ branchId: META.label }] },
              { id: "general-identity-c3", fields: [{ branchId: META.labelPlural }] },
            ],
          },
          {
            id: "general-display",
            columns: [
              { id: "general-display-c1", fields: [{ branchId: META.displayNameAlias }] },
            ],
          },
          {
            id: "general-flags",
            label: t("seedBuilder.editor.capabilities"),
            columns: [
              { id: "general-flags-c1", fields: [{ branchId: META.allowPublicRead }, { branchId: META.allowPublicPost }] },
              { id: "general-flags-c2", fields: [{ branchId: META.allowPublicEdit }, { branchId: META.allowDrafts }] },
            ],
          },
        ],
      },
      {
        id: "fields",
        label: t("seedBuilder.editor.tabFields"),
        sections: [
          {
            id: "fields-main",
            hideLabel: true,
            columns: [{ id: "fields-main-c1", fields: [{ branchId: META.branches }] }],
          },
        ],
      },
      {
        id: "dashboard",
        label: t("seedBuilder.editor.tabDashboard"),
        sections: [
          {
            id: "dashboard-main",
            columns: [
              { id: "dashboard-main-c1", fields: [{ branchId: META.dashIcon }] },
              { id: "dashboard-main-c2", fields: [{ branchId: META.dashGroup }] },
              { id: "dashboard-main-c3", fields: [{ branchId: META.dashOrder }] },
            ],
          },
          {
            id: "dashboard-extra",
            columns: [
              { id: "dashboard-extra-c1", fields: [{ branchId: META.dashHidden }] },
              { id: "dashboard-extra-c2", fields: [{ branchId: META.dashDescription }] },
            ],
          },
          {
            id: "dashboard-views",
            label: t("seedBuilder.editor.dashViewsSection", { defaultValue: "Authorized views" }),
            columns: [
              { id: "dashboard-views-c1", fields: [{ branchId: META.dashViewGallery }] },
              { id: "dashboard-views-c2", fields: [{ branchId: META.dashViewKanban }] },
            ],
          },
        ],
      },
    ],
  }
}
