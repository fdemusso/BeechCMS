// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect } from "vitest"
import en from "./en.json"
import itJson from "./it.json"

describe("dashboard locales parity and coverage", () => {
  it("en.json contains required rbac invitation and role keys", () => {
    expect(en.rbac?.invitations?.copyLink).toBe("Copy invite link")
    expect(en.rbac?.invitations?.linkCopied).toBe("Invite link copied")
    expect(en.rbac?.roles?.moreRoles).toBe("+{{count}} more")
  })

  it("it.json contains required rbac invitation and role keys", () => {
    expect(itJson.rbac?.invitations?.copyLink).toBe("Copia link di invito")
    expect(itJson.rbac?.invitations?.linkCopied).toBe("Link di invito copiato")
    expect(itJson.rbac?.roles?.moreRoles).toBe("+{{count}} altri")
  })
})
