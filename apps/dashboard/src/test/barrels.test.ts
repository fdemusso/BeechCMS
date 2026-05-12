import { describe, it, expect } from "vitest"

import * as LoginFormIndex from "@/components/login-form"
import * as NotificationsIndex from "@/components/notifications-popover"
import * as ContentDeleteDialogIndex from "@/components/content-delete-dialog"
import * as ContentToolbarIndex from "@/features/content-toolbar"

describe("barrel exports", () => {
  it("espone simboli principali dai barrel", () => {
    expect(LoginFormIndex.LoginForm).toBeTypeOf("function")
    expect(NotificationsIndex.NotificationsPopover).toBeTypeOf("function")
    expect(ContentDeleteDialogIndex.ContentDeleteDialog).toBeTypeOf("function")
    expect(ContentToolbarIndex.ContentToolbar).toBeTypeOf("function")
    expect(ContentToolbarIndex.DEFAULT_ENABLED_TOOLS).toBeDefined()
  })
})
