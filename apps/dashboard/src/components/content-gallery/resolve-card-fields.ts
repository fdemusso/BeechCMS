import type { Branch, Seed } from "@beechcms/core"

export interface ResolvedCardFields {
  coverBranch: Branch | null
  titleBranch: Branch | null
  excerptBranch: Branch | null
  dateBranch: Branch | null
  tagsBranch: Branch | null
}

function includesAnyToken(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token))
}

export function resolveCardFields(seed: Seed): ResolvedCardFields {
  const branches = seed.branches

  const coverBranch =
    branches.find((branch) => {
      if (branch.type !== "file") return false
      const alias = branch.alias.trim().toLowerCase()
      return includesAnyToken(alias, ["cover", "image", "foto", "photo"])
    }) ?? null

  const titleBranch =
    branches.find((branch) => {
      const alias = branch.alias.trim().toLowerCase()
      return alias === "title" || alias === "name"
    }) ?? null

  const excerptBranch =
    branches.find((branch) => {
      if (branch.type !== "richtext" && branch.type !== "text") return false
      if (!titleBranch) return true
      return branch.alias !== titleBranch.alias
    }) ?? null

  const dateBranch = branches.find((branch) => branch.type === "date") ?? null

  const tagsBranch =
    branches.find((branch) => {
      if (branch.type !== "json") return false
      return branch.alias.toLowerCase().includes("tag")
    }) ?? null

  return {
    coverBranch,
    titleBranch,
    excerptBranch,
    dateBranch,
    tagsBranch,
  }
}
