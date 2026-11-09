// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { Seed } from "@beechcms/core"
import { Check, X } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { SEED_FORM_STEPS, useSeedForm, type SeedFormStep } from "../hooks/use-seed-form"
import type { SeedRecordDTO } from "../api/seeds.api"
import { FieldsStep } from "./FieldsStep"
import { HardDeleteDialog } from "./HardDeleteDialog"
import { DashboardStep } from "./DashboardStep"
import { DiscardChangesDialog } from "./DiscardChangesDialog"
import { GeneralStep } from "./GeneralStep"
import { SeedDangerZone } from "./SeedDangerZone"
import { SeedFormFooter } from "./SeedFormFooter"
import { SlidingTabIndicator } from "./SlidingTabIndicator"

export interface SeedFormDialogProps {
  open: boolean
  /** Present ⇒ edit; absent ⇒ create. */
  editRecord: SeedRecordDTO | null
  activeSeedsForRelation: Seed[]
  /** Slugs already in use, so a new content type never collides with one. */
  takenSlugs: readonly string[]
  /** The stored content types: the sidebar groups in use, and the neighbours shown in the sidebar preview. */
  existingSeeds: readonly Seed[]
  onClose: () => void
}

const STEP_LABEL_KEYS: Record<SeedFormStep, string> = {
  general: "seedBuilder.editor.tabGeneral",
  fields: "seedBuilder.editor.tabFields",
  dashboard: "seedBuilder.editor.tabDashboard",
}

/**
 * Create / edit dialog of a content type. Creating is a guided process (General → Fields → Dashboard):
 * a step opens only when the ones before it are complete, and "Next" replaces "Create" until the last one.
 * Editing a stored seed opens every step at once.
 */
export function SeedFormDialog({ open, editRecord, activeSeedsForRelation, takenSlugs, existingSeeds, onClose }: SeedFormDialogProps) {
  const { t } = useTranslation()
  const form = useSeedForm({ editRecord, takenSlugs, onClose, open })
  const { isCreate } = form

  const labelInputRef = React.useRef<HTMLInputElement>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const title = editRecord
    ? t("seedBuilder.editor.editTitle", { label: editRecord.definition.label })
    : t("seedBuilder.editor.createTitle")

  /**
   * Enter never submits by accident from a text input: it moves to the next input marked `data-enter-next`
   * and, from the last one while creating, on to the next step. Ctrl/Cmd+Enter submits (or advances) from anywhere.
   */
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.currentTarget.requestSubmit()
      return
    }
    const target = e.target as HTMLElement
    if (target.tagName !== "INPUT") return
    e.preventDefault()
    const chain = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-enter-next]"))
    const index = chain.indexOf(target)
    if (index === -1) return
    if (index < chain.length - 1) chain[index + 1].focus()
    else if (isCreate) form.goNext()
  }

  // A tab slides in from the side it sits on, relative to the one just left: later tabs come from the right.
  const steps = editRecord ? ([...SEED_FORM_STEPS, "danger"] as const) : SEED_FORM_STEPS
  const [stepMove, setStepMove] = React.useState<{ step: string; forward: boolean }>({ step: form.step, forward: true })
  if (stepMove.step !== form.step) {
    // Derived during render, so the new tab already mounts with the right direction.
    setStepMove({ step: form.step, forward: (steps as readonly string[]).indexOf(form.step) >= (steps as readonly string[]).indexOf(stepMove.step) })
  }
  const enter = cn(
    "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-(--duration-enter)",
    stepMove.forward ? "motion-safe:slide-in-from-right-2" : "motion-safe:slide-in-from-left-2"
  )

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) form.requestClose() }}>
        <DialogContent
          // Fixed height, sized to the Fields step with a full list (the tallest): the steps differ in length and the
          // centred dialog would otherwise jump on every tab.
          className="flex h-[min(46.5rem,calc(100vh-2rem))] flex-col gap-0 p-0 sm:max-w-3xl md:max-w-5xl data-open:zoom-in-100 data-open:duration-(--duration-enter) data-closed:zoom-out-100 data-closed:duration-(--duration-exit)"
          // A plain fade, 220ms in and 20% quicker out, for the backdrop as well as the dialog.
          overlayClassName="data-open:duration-(--duration-enter) data-closed:duration-(--duration-exit)"
          // Outside click and Escape ask before dropping unsaved edits; the X below is deliberate and does not.
          showCloseButton={false}
          // Radix focuses the first tab; a new content type starts with the name instead.
          onOpenAutoFocus={(e) => {
            if (!isCreate) return
            e.preventDefault()
            labelInputRef.current?.focus()
          }}
        >
          <DialogHeader className="flex-shrink-0 px-6 pb-4 pt-6">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
          <Button type="button" variant="ghost" size="icon-sm" className="absolute top-2 right-2" onClick={onClose}>
            <X />
            <span className="sr-only">{t("common.close")}</span>
          </Button>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit} onKeyDown={handleFormKeyDown}>
            <Tabs
              value={form.step}
              onValueChange={(value) => form.setStep(value as SeedFormStep | "danger")}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="flex-shrink-0 border-b px-6">
                <TabsList variant="line" className="relative h-auto w-fit justify-start gap-6 p-0">
                  <SlidingTabIndicator activeValue={form.step} />
                  {steps.map((id, index) => {
                    const isStep = id !== "danger"
                    // Only a step already passed shows its check: a locked one must not look done.
                    const complete = isStep && index < SEED_FORM_STEPS.indexOf(form.step as SeedFormStep) && form.stepComplete[id]
                    return (
                      <TabsTrigger
                        key={id}
                        value={id}
                        disabled={isStep && !form.isStepReachable(id)}
                        // The trigger ends 1px above the header's border (h-[calc(100%-1px)]): -2px lays the 2px line over it.
                        className="gap-2 px-0 py-3 font-medium group-data-[variant=line]/tabs-list:data-active:after:opacity-0"
                      >
                        {isStep && isCreate && (
                          <span
                            aria-hidden
                            className={
                              "flex size-6 items-center justify-center rounded-full text-xs " +
                              (complete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
                            }
                          >
                            {complete ? <Check className="size-4" /> : index + 1}
                          </span>
                        )}
                        {id === "danger"
                          ? t("seedBuilder.editor.dangerZoneToggle")
                          : t(STEP_LABEL_KEYS[id])}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="px-6 py-4">
                  {/* Step 1 — identity and public access */}
                  <TabsContent value="general" className={cn("mt-0 space-y-6", enter)}>
                    <GeneralStep form={form} labelInputRef={labelInputRef} />
                  </TabsContent>

                  {/* Step 2 — fields */}
                  <TabsContent value="fields" className={cn("mt-0 space-y-4", enter)}>
                    <FieldsStep
                      branches={form.branches}
                      onChange={(branches) => form.setField("branches", branches)}
                      activeSeedsForRelation={activeSeedsForRelation}
                      tableEmpty={form.tableEmpty}
                      canUseTemplates={isCreate}
                      onOpenDangerZone={editRecord ? () => form.setStep("danger") : undefined}
                      onApplyTemplate={(template) => {
                        form.setField("branches", template.branches)
                        form.setField("display_name_alias", template.displayNameAlias)
                        form.setField("allow_drafts", template.allowDrafts)
                      }}
                    />
                  </TabsContent>

                  {/* Step 3 — how the content type appears in the dashboard */}
                  <TabsContent value="dashboard" className={cn("mt-0 space-y-6", enter)}>
                    <DashboardStep form={form} editRecord={editRecord ?? null} existingSeeds={existingSeeds} />
                  </TabsContent>

                  {editRecord && (
                    <TabsContent value="danger" className={cn("mt-0", enter)}>
                      <SeedDangerZone record={editRecord} state={form.danger} onStateChange={form.setDanger} onChooseDisplayName={() => form.setStep("dashboard")} />
                    </TabsContent>
                  )}
                </div>
              </ScrollArea>
            </Tabs>

            <SeedFormFooter form={form} editRecord={editRecord ?? null} onDelete={() => setDeleteOpen(true)} />
          </form>
        </DialogContent>
      </Dialog>

      <HardDeleteDialog seed={editRecord ?? null} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={onClose} />

      <DiscardChangesDialog form={form} onClose={onClose} />
    </>
  )
}
