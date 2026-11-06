// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { Seed } from "@beechcms/core"
import { Check, Globe, Trash2 } from "@/components/icons"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { IconPicker } from "@/components/ui/icon-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SEED_FORM_STEPS, useSeedForm, type SeedFormStep } from "../hooks/use-seed-form"
import { DEFAULT_SIDEBAR_ORDER, existingGroups, sidebarGroupPreview } from "../lib/sidebar-preview"
import type { SeedRecordDTO } from "../api/seeds.api"
import { DisplayNamePicker } from "./DisplayNamePicker"
import { GroupPicker } from "./GroupPicker"
import { SidebarPreview } from "./SidebarPreview"
import { ViewsPicker } from "./ViewsPicker"
import { FieldsStep } from "./FieldsStep"
import { HardDeleteDialog } from "./HardDeleteDialog"
import { SeedDangerZone } from "./SeedDangerZone"

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

/** Public API flags, in the order they are shown: form-data alias and the i18n key of their label/hint. */
const PUBLIC_FLAGS = [
  { alias: "allow_public_read", key: "allowPublicRead" },
  { alias: "allow_public_post", key: "allowPublicPost" },
  { alias: "allow_public_edit", key: "allowPublicEdit" },
] as const

const STEP_LABEL_KEYS: Record<SeedFormStep, string> = {
  general: "seedBuilder.editor.tabGeneral",
  fields: "seedBuilder.editor.tabFields",
  dashboard: "seedBuilder.editor.tabDashboard",
}

/** A label, its control and an optional hint, with the control on the right (switch rows). */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  )
}

/**
 * Create / edit dialog of a content type. Creating is a guided process (General → Fields → Dashboard):
 * a step opens only when the ones before it are complete, and "Next" replaces "Create" until the last one.
 * Editing a stored seed opens every step at once.
 */
export function SeedFormDialog({ open, editRecord, activeSeedsForRelation, takenSlugs, existingSeeds, onClose }: SeedFormDialogProps) {
  const { t } = useTranslation()
  const form = useSeedForm({ editRecord, takenSlugs, onClose, open })
  const { formData, isCreate, setField } = form

  const labelInputRef = React.useRef<HTMLInputElement>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const label = String(formData.label ?? "")
  const slug = String(formData.slug ?? "")

  const title = editRecord
    ? t("seedBuilder.editor.editTitle", { label: editRecord.definition.label })
    : t("seedBuilder.editor.createTitle")

  const defaultGroupLabel = t("sidebar.contents")
  const dashGroup = String(formData.dash_group ?? "")
  const dashOrder = typeof formData.dash_order === "number" ? formData.dash_order : undefined
  const groupPreview = sidebarGroupPreview(
    existingSeeds,
    {
      slug: editRecord?.slug ?? null,
      title: String(formData.label_plural || formData.label || "") || t("seedBuilder.editor.dashPreviewNew"),
      icon: String(formData.dash_icon ?? ""),
      description: String(formData.dash_description ?? "") || undefined,
      order: dashOrder,
    },
    dashGroup
  )
  const authorizedViews = (["gallery", "kanban"] as const).filter((view) => !!formData[`dash_view_${view}`])

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

  const steps = editRecord ? ([...SEED_FORM_STEPS, "danger"] as const) : SEED_FORM_STEPS

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) form.requestClose() }}>
        <DialogContent
          // Fixed height, sized to the Fields step with a full list (the tallest): the steps differ in length and the
          // centred dialog would otherwise jump on every tab.
          className="flex h-[min(46.5rem,calc(100vh-2rem))] flex-col gap-0 p-0 sm:max-w-3xl md:max-w-5xl"
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

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit} onKeyDown={handleFormKeyDown}>
            <Tabs
              value={form.step}
              onValueChange={(value) => form.setStep(value as SeedFormStep | "danger")}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="flex-shrink-0 border-b px-6">
                <TabsList variant="line" className="h-auto w-fit justify-start gap-6 p-0">
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
                        className="gap-2 px-0 py-3 font-medium group-data-horizontal/tabs:after:bottom-[-2px]"
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
                  <TabsContent value="general" className="mt-0 space-y-6">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="sf-label">{t("seedBuilder.editor.label")}</FieldLabel>
                        <div className="flex items-center gap-2">
                          <IconPicker
                            value={String(formData.dash_icon ?? "")}
                            onChange={(icon) => setField("dash_icon", icon)}
                            fallback="Folder"
                            ariaLabel={t("seedBuilder.editor.selectIcon")}
                            searchPlaceholder={t("seedBuilder.editor.searchIcons")}
                            emptyLabel={t("seedBuilder.editor.noIconsFound")}
                          />
                          <Input
                            id="sf-label"
                            ref={labelInputRef}
                            data-enter-next=""
                            value={label}
                            placeholder={t("seedBuilder.editor.labelPlaceholder")}
                            onChange={(e) => form.setLabel(e.target.value)}
                            className="flex-1"
                          />
                        </div>
                      </Field>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="sf-slug">{t("seedBuilder.editor.slug")}</FieldLabel>
                          <InputGroup>
                            <InputGroupAddon>
                              <InputGroupText>content_</InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput
                              id="sf-slug"
                              data-enter-next=""
                              value={slug}
                              readOnly={!isCreate}
                              onChange={(e) => form.setSlug(e.target.value)}
                              className="pl-0"
                            />
                          </InputGroup>
                          {form.slugTaken && <FieldError>{t("seedBuilder.editor.slugTaken")}</FieldError>}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="sf-plural">{t("seedBuilder.editor.labelPlural")}</FieldLabel>
                          <Input
                            id="sf-plural"
                            data-enter-next=""
                            value={String(formData.label_plural ?? "")}
                            placeholder={label || t("seedBuilder.editor.labelPluralPlaceholder")}
                            onChange={(e) => setField("label_plural", e.target.value)}
                          />
                        </Field>
                      </div>
                      <FieldDescription>{t("seedBuilder.editor.hints.slug")}</FieldDescription>
                    </FieldGroup>

                    <SwitchRow
                      id="sf-allow_drafts"
                      label={t("seedBuilder.editor.allowDrafts")}
                      hint={t("seedBuilder.editor.hints.allowDrafts")}
                      checked={!!formData.allow_drafts}
                      onCheckedChange={(checked) => setField("allow_drafts", checked)}
                    />

                    {/* Anonymous visitors: a layer apart from roles (RBAC) */}
                    <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
                      <div className="space-y-1">
                        <h3 className="flex items-center gap-2 text-sm font-medium">
                          <Globe className="size-4 shrink-0 text-muted-foreground" />
                          {t("seedBuilder.editor.publicAccessTitle")}
                        </h3>
                        <p className="text-xs text-muted-foreground">{t("seedBuilder.editor.publicAccessDescription")}</p>
                      </div>
                      <div className="space-y-3 border-t pt-3">
                        {PUBLIC_FLAGS.map(({ alias, key }) => (
                          <SwitchRow
                            key={alias}
                            id={`sf-${alias}`}
                            label={t(`seedBuilder.editor.${key}`)}
                            hint={t(`seedBuilder.editor.hints.${key}`)}
                            checked={!!formData[alias]}
                            onCheckedChange={(checked) => setField(alias, checked)}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{t("seedBuilder.editor.publicAccessRbacNote")}</p>
                    </section>
                  </TabsContent>

                  {/* Step 2 — fields */}
                  <TabsContent value="fields" className="mt-0 space-y-4">
                    <FieldsStep
                      branches={form.branches}
                      onChange={(branches) => setField("branches", branches)}
                      activeSeedsForRelation={activeSeedsForRelation}
                      tableEmpty={form.tableEmpty}
                      canUseTemplates={isCreate}
                      onApplyTemplate={(template) => {
                        setField("branches", template.branches)
                        setField("display_name_alias", template.displayNameAlias)
                        setField("allow_drafts", template.allowDrafts)
                      }}
                    />
                  </TabsContent>

                  {/* Step 3 — how the content type appears in the dashboard */}
                  <TabsContent value="dashboard" className="mt-0 space-y-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                      <FieldGroup>
                        {form.branches.length > 0 && (
                          <Field>
                            <FieldLabel htmlFor="sf-display">{t("seedBuilder.editor.displayNameAlias")}</FieldLabel>
                            <DisplayNamePicker
                              id="sf-display"
                              branches={form.branches}
                              value={form.displayNameAlias}
                              onChange={(alias) => setField("display_name_alias", alias)}
                            />
                          </Field>
                        )}
                        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-4">
                          <Field>
                            <FieldLabel htmlFor="sf-group">{t("seedBuilder.editor.dashGroup")}</FieldLabel>
                            <GroupPicker
                              id="sf-group"
                              value={dashGroup}
                              groups={existingGroups(existingSeeds)}
                              defaultLabel={defaultGroupLabel}
                              onChange={(group) => setField("dash_group", group)}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="sf-order">{t("seedBuilder.editor.dashOrder")}</FieldLabel>
                            <Input
                              id="sf-order"
                              data-enter-next=""
                              type="number"
                              min={0}
                              value={dashOrder ?? ""}
                              placeholder={String(DEFAULT_SIDEBAR_ORDER)}
                              onChange={(e) =>
                                setField("dash_order", e.target.value === "" ? undefined : Number(e.target.value))
                              }
                            />
                          </Field>
                        </div>
                        <p className="-mt-2 text-xs text-muted-foreground">{t("seedBuilder.editor.dashOrderHint")}</p>
                        <Field>
                          <FieldLabel htmlFor="sf-description">{t("seedBuilder.editor.dashDescription")}</FieldLabel>
                          <Input
                            id="sf-description"
                            data-enter-next=""
                            value={String(formData.dash_description ?? "")}
                            placeholder={t("seedBuilder.editor.dashDescriptionPlaceholder")}
                            onChange={(e) => setField("dash_description", e.target.value)}
                          />
                        </Field>
                        <SwitchRow
                          id="sf-hidden"
                          label={t("seedBuilder.editor.dashHidden")}
                          checked={!!formData.dash_hidden}
                          onCheckedChange={(checked) => setField("dash_hidden", checked)}
                        />
                      </FieldGroup>

                      <SidebarPreview
                        groupLabel={dashGroup || defaultGroupLabel}
                        {...groupPreview}
                        hidden={!!formData.dash_hidden}
                      />
                    </div>

                    <div className="space-y-3 border-t pt-5">
                      <p className="text-sm font-medium">{t("seedBuilder.editor.dashViewsSection")}</p>
                      <ViewsPicker
                        selected={authorizedViews}
                        onToggle={(view, checked) => setField(`dash_view_${view}`, checked)}
                      />
                    </div>
                  </TabsContent>

                  {editRecord && (
                    <TabsContent value="danger" className="mt-0">
                      <SeedDangerZone record={editRecord} />
                    </TabsContent>
                  )}
                </div>
              </ScrollArea>
            </Tabs>

            {form.step === "danger" && editRecord ? (
              <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t px-6 py-4">
                <p className="text-xs text-muted-foreground">
                  {editRecord.source === "code"
                    ? t("seedBuilder.dangerZone.hardDelete.manifestHint")
                    : t("seedBuilder.dangerZone.hardDelete.footerHint")}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={editRecord.source === "code"}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  {t("seedBuilder.dangerZone.hardDelete.footerButton")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t px-6 py-4">
                <div className="flex items-center gap-3">
                  {isCreate && form.step !== SEED_FORM_STEPS[0] && (
                    <Button type="button" variant="outline" onClick={form.goBack}>
                      {t("seedBuilder.editor.back")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <Kbd>Ctrl</Kbd>
                    <Kbd>↵</Kbd>
                    {isCreate && !form.isLastStep ? t("seedBuilder.editor.nextShortcut") : t("seedBuilder.editor.saveShortcut")}
                  </span>
                  {isCreate && !form.isLastStep ? (
                    <Button type="submit" disabled={!form.canAdvance}>
                      {t("seedBuilder.editor.next")}
                    </Button>
                  ) : (
                    <Button type="submit" disabled={!form.canSubmit}>
                      {isCreate ? t("common.create") : t("common.save")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      <HardDeleteDialog seed={editRecord ?? null} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={onClose} />

      {/* Leaving with unsaved edits: closing the dialog, or navigating away */}
      <AlertDialog open={form.confirmDiscardOpen || form.blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("content.editor.unsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("content.editor.unsavedDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                form.setConfirmDiscardOpen(false)
                form.blocker.reset?.()
              }}
            >
              {t("content.editor.stay")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                form.setConfirmDiscardOpen(false)
                form.discardDraft()
                if (form.blocker.state === "blocked") form.blocker.proceed?.()
                else onClose()
              }}
            >
              {t("content.editor.exitWithout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
