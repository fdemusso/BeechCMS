import type { Branch, Seed } from "@beechcms/core"

/** Allineato a `entry-editor.tsx`: campi SEO con alias che iniziano per `meta`. */
export function isSeoBranch(branch: Branch): boolean {
  return branch.alias.startsWith("meta")
}

export function isTagsBranch(branch: Branch): boolean {
  return branch.type === "json" && branch.alias.toLowerCase().includes("tag")
}

export function isTitleBranch(branch: Branch): boolean {
  const alias = branch.alias.trim().toLowerCase()
  return alias === "title" || alias === "name"
}

export interface PartitionGalleryDetailBranches {
  tagsBranch: Branch | null
  seoBranches: Branch[]
  mainBranches: Branch[]
}

export function partitionGalleryDetailBranches(seed: Seed): PartitionGalleryDetailBranches {
  const tagsBranch = seed.branches.find(isTagsBranch) ?? null
  const seoBranches = seed.branches.filter(isSeoBranch)
  const mainBranches = seed.branches.filter(
    (b) => !isSeoBranch(b) && !isTitleBranch(b) && b.alias !== tagsBranch?.alias
  )
  return { tagsBranch, seoBranches, mainBranches }
}

export function splitMainRichtext(mainBranches: Branch[]): {
  richtextBranch: Branch | null
  otherMainBranches: Branch[]
} {
  const richtextBranch = mainBranches.find((b) => b.type === "richtext") ?? null
  const otherMainBranches = richtextBranch
    ? mainBranches.filter((b) => b.alias !== richtextBranch.alias)
    : mainBranches
  return { richtextBranch, otherMainBranches }
}
