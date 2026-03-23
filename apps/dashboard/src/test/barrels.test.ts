import { describe, it, expect } from "vitest"

import * as LoginFormIndex from "@/components/login-form"
import * as NotificationsIndex from "@/components/notifications-popover"
import * as ContentDeleteDialogIndex from "@/components/content-delete-dialog"

describe("barrel exports", () => {
  it("espone simboli principali dai barrel", () => {
    expect(LoginFormIndex.LoginForm).toBeTypeOf("function")
    expect(NotificationsIndex.NotificationsPopover).toBeTypeOf("function")
    expect(ContentDeleteDialogIndex.ContentDeleteDialog).toBeTypeOf("function")
  })
})
