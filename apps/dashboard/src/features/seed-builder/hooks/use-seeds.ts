// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { seedsApi } from "../api/seeds.api"
import type { Seed } from "@beechcms/core"
import type { AxiosError } from "axios"

interface ProblemDetail {
  detail?: string
  title?: string
}

function extractDetail(err: unknown): string {
  const axErr = err as AxiosError<ProblemDetail>
  return axErr?.response?.data?.detail ?? axErr?.response?.data?.title ?? String(err)
}

export function useSeeds() {
  return useQuery({ queryKey: ["seeds"], queryFn: seedsApi.list, staleTime: 1000 * 30 })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ["seeds"] })
    qc.invalidateQueries({ queryKey: ["schema"] })
  }
}

export function useCreateSeed() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: seedsApi.create,
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.errors.createFailed"), { description: extractDetail(err) }),
  })
}

export function useUpdateSeed() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({ slug, seed }: { slug: string; seed: Seed }) => seedsApi.update(slug, seed),
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.errors.updateFailed"), { description: extractDetail(err) }),
  })
}

export function useDeleteSeed() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: seedsApi.remove,
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.errors.deleteFailed"), { description: extractDetail(err) }),
  })
}

export function useHardDeleteSeed() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({ slug, confirm }: { slug: string; confirm: string }) => seedsApi.hardDelete(slug, confirm),
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.dangerZone.errors.hardDeleteFailed"), { description: extractDetail(err) }),
  })
}

export function useDropBranch() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({ slug, branchId, confirm }: { slug: string; branchId: string; confirm: string }) =>
      seedsApi.dropBranch(slug, branchId, confirm),
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.dangerZone.errors.dropColumnFailed"), { description: extractDetail(err) }),
  })
}

export function useRenameBranch() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({ slug, branchId, newAlias, confirm }: { slug: string; branchId: string; newAlias: string; confirm: string }) =>
      seedsApi.renameBranch(slug, branchId, newAlias, confirm),
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.dangerZone.errors.renameFailed"), { description: extractDetail(err) }),
  })
}

export function useRetypeBranch() {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({ slug, branchId, newType, confirm }: { slug: string; branchId: string; newType: string; confirm: string }) =>
      seedsApi.retypeBranch(slug, branchId, newType, confirm),
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.dangerZone.errors.retypeFailed"), { description: extractDetail(err) }),
  })
}

export function useRebuildFts(slug: string) {
  const inv = useInvalidate()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: () => seedsApi.rebuildFts(slug),
    onSuccess: inv,
    onError: (err) => toast.error(t("seedBuilder.dangerZone.errors.ftsRebuildFailed"), { description: extractDetail(err) }),
  })
}

export function useOrphans(slug: string) {
  return useQuery({
    queryKey: ["seeds", slug, "orphans"],
    queryFn: () => seedsApi.getOrphans(slug),
    staleTime: 0,
  })
}
