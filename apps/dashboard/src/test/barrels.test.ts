import { describe, it, expect } from "vitest"

import * as LoginFormIndex from "@/features/auth/components/login-form"
import * as NotificationsIndex from "@/features/notifications/components/notifications-popover"
import * as ContentDeleteDialogIndex from "@/features/content-delete-dialog"
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
