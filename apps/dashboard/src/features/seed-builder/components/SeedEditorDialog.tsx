// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { Seed, Branch } from "@beechcms/core"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useCreateSeed, useUpdateSeed } from "../hooks/use-seeds"
import { BranchEditor } from "./BranchEditor"
import type { SeedRecordDTO } from "../api/seeds.api"
import { ICON_NAMES } from "@/lib/icon-registry"

const seedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_]+$/, "Only a-z, 0-9, _").min(1, "Required"),
  label: z.string().min(1, "Required"),
  labelPlural: z.string().optional(),
  displayNameAlias: z.string().min(1, "Required"),
  allowPublicRead: z.boolean().optional(),
  allowPublicPost: z.boolean().optional(),
  allowPublicEdit: z.boolean().optional(),
  allowDrafts: z.boolean().optional(),
  dashboardIcon: z.string().optional(),
  dashboardGroup: z.string().optional(),
  dashboardOrder: z.number().optional(),
  dashboardHidden: z.boolean().optional(),
  dashboardDescription: z.string().optional(),
  featSearch: z.boolean().optional(),
  featFilter: z.boolean().optional(),
  featExport: z.boolean().optional(),
  featBulkDelete: z.boolean().optional(),
})

type SeedFormValues = z.infer<typeof seedSchema>

interface SeedEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editRecord?: SeedRecordDTO | null
  activeSeedsForRelation: Seed[]
}

function defaultValues(record?: SeedRecordDTO | null): SeedFormValues {
  if (!record) {
    return {
      slug: "", label: "", labelPlural: "", displayNameAlias: "",
      allowPublicRead: false, allowPublicPost: false, allowPublicEdit: false, allowDrafts: false,
      dashboardHidden: false, featSearch: true, featFilter: true, featExport: true, featBulkDelete: true,
    }
  }
  const d = record.definition
  return {
    slug: d.slug,
    label: d.label,
    labelPlural: d.labelPlural ?? "",
    displayNameAlias: d.displayNameAlias,
    allowPublicRead: d.allowPublicRead ?? false,
    allowPublicPost: d.allowPublicPost ?? false,
    allowPublicEdit: d.allowPublicEdit ?? false,
    allowDrafts: d.allowDrafts ?? false,
    dashboardIcon: d.dashboard?.icon ?? "",
    dashboardGroup: d.dashboard?.group ?? "",
    dashboardOrder: d.dashboard?.order,
    dashboardHidden: d.dashboard?.hidden ?? false,
    dashboardDescription: d.dashboard?.description ?? "",
    featSearch: d.dashboard?.features?.search !== false,
    featFilter: d.dashboard?.features?.filter !== false,
    featExport: d.dashboard?.features?.export !== false,
    featBulkDelete: d.dashboard?.features?.bulkDelete !== false,
  }
}

export function SeedEditorDialog({ open, onOpenChange, editRecord, activeSeedsForRelation }: SeedEditorDialogProps) {
  const { t } = useTranslation()
  const isEdit = !!editRecord
  const createMutation = useCreateSeed()
  const updateMutation = useUpdateSeed()
  const [branches, setBranches] = useState<Branch[]>([])

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<SeedFormValues>({
    resolver: zodResolver(seedSchema),
    defaultValues: defaultValues(null),
  })

  useEffect(() => {
    if (open) {
      reset(defaultValues(editRecord))
      setBranches(editRecord?.definition.branches ?? [])
    }
  }, [open, editRecord, reset])

  const branchAliases = branches.filter(b => b.alias)

  function buildSeed(values: SeedFormValues): Seed {
    const cleanBranches: Branch[] = branches.map(b => {
      if (b.id.startsWith("br_new_")) {
        const { id, ...rest } = b
        void id
        return rest as Branch
      }
      return b
    })

    return {
      slug: values.slug,
      label: values.label,
      labelPlural: values.labelPlural || undefined,
      displayNameAlias: values.displayNameAlias,
      allowPublicRead: values.allowPublicRead,
      allowPublicPost: values.allowPublicPost,
      allowPublicEdit: values.allowPublicEdit,
      allowDrafts: values.allowDrafts,
      branches: cleanBranches,
      dashboard: {
        icon: values.dashboardIcon || undefined,
        group: values.dashboardGroup || undefined,
        order: values.dashboardOrder,
        hidden: values.dashboardHidden,
        description: values.dashboardDescription || undefined,
        features: {
          search: values.featSearch,
          filter: values.featFilter,
          export: values.featExport,
          bulkDelete: values.featBulkDelete,
        },
      },
    }
  }

  function onSubmit(values: SeedFormValues) {
    const seed = buildSeed(values)
    if (isEdit && editRecord) {
      updateMutation.mutate({ slug: editRecord.slug, seed }, {
        onSuccess: () => {
          toast.success(t("seedBuilder.editor.updateSuccess", { label: seed.label }))
          onOpenChange(false)
        },
      })
    } else {
      createMutation.mutate(seed, {
        onSuccess: () => {
          toast.success(t("seedBuilder.editor.createSuccess", { label: seed.label }))
          onOpenChange(false)
        },
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>
            {isEdit
              ? t("seedBuilder.editor.editTitle", { label: editRecord?.definition.label })
              : t("seedBuilder.editor.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <Tabs defaultValue="general" className="flex flex-col flex-1 min-h-0 px-6 pt-4">
            <TabsList className="shrink-0 w-full">
              <TabsTrigger value="general" className="flex-1">{t("seedBuilder.editor.tabGeneral")}</TabsTrigger>
              <TabsTrigger value="fields" className="flex-1">{t("seedBuilder.editor.tabFields")}</TabsTrigger>
              <TabsTrigger value="dashboard" className="flex-1">{t("seedBuilder.editor.tabDashboard")}</TabsTrigger>
            </TabsList>

            {/* General tab */}
            <TabsContent value="general" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="space-y-4 py-4 pr-2">
                  <div className="space-y-1">
                    <Label>{t("seedBuilder.editor.slug")}</Label>
                    {isEdit ? (
                      <div className="flex items-center gap-2">
                        <Input value={editRecord?.slug} readOnly className="bg-muted text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{t("seedBuilder.editor.slugImmutable")}</span>
                      </div>
                    ) : (
                      <>
                        <Input {...register("slug")} placeholder="content_type" />
                        {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t("seedBuilder.editor.label")}</Label>
                      <Input {...register("label")} placeholder={t("seedBuilder.editor.labelPlaceholder")} />
                      {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label>{t("seedBuilder.editor.labelPlural")}</Label>
                      <Input {...register("labelPlural")} placeholder={t("seedBuilder.editor.labelPluralPlaceholder")} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>{t("seedBuilder.editor.displayNameAlias")}</Label>
                    <Controller
                      name="displayNameAlias"
                      control={control}
                      render={({ field }) => (
                        branchAliases.length > 0 ? (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("seedBuilder.editor.displayNameAliasPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {branchAliases.map(b => (
                                <SelectItem key={b.id} value={b.alias}>{b.label || b.alias}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input {...field} placeholder={t("seedBuilder.editor.displayNameAliasPlaceholder")} />
                        )
                      )}
                    />
                    {errors.displayNameAlias && <p className="text-xs text-destructive">{errors.displayNameAlias.message}</p>}
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{t("seedBuilder.editor.capabilities")}</p>
                    {([
                      ["allowPublicRead", "seedBuilder.editor.allowPublicRead"],
                      ["allowPublicPost", "seedBuilder.editor.allowPublicPost"],
                      ["allowPublicEdit", "seedBuilder.editor.allowPublicEdit"],
                      ["allowDrafts", "seedBuilder.editor.allowDrafts"],
                    ] as const).map(([fieldName, labelKey]) => (
                      <div key={fieldName} className="flex items-center gap-2">
                        <Controller
                          name={fieldName}
                          control={control}
                          render={({ field: f }) => (
                            <Checkbox
                              id={fieldName}
                              checked={!!f.value}
                              onCheckedChange={v => f.onChange(!!v)}
                            />
                          )}
                        />
                        <Label htmlFor={fieldName} className="cursor-pointer font-normal">{t(labelKey)}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Fields tab */}
            <TabsContent value="fields" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="py-4 pr-2">
                  <BranchEditor
                    branches={branches}
                    existingBranches={editRecord?.definition.branches ?? []}
                    activeSeedsForRelation={activeSeedsForRelation}
                    onChange={setBranches}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Dashboard config tab */}
            <TabsContent value="dashboard" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="space-y-4 py-4 pr-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t("seedBuilder.editor.dashIcon")}</Label>
                      <Controller
                        name="dashboardIcon"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("seedBuilder.editor.dashIconPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">{t("seedBuilder.editor.dashIconDefault")}</SelectItem>
                              {ICON_NAMES.map(name => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t("seedBuilder.editor.dashGroup")}</Label>
                      <Input {...register("dashboardGroup")} placeholder={t("seedBuilder.editor.dashGroupPlaceholder")} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t("seedBuilder.editor.dashOrder")}</Label>
                      <Input type="number" {...register("dashboardOrder", { valueAsNumber: true })} placeholder="99" />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Controller
                        name="dashboardHidden"
                        control={control}
                        render={({ field }) => (
                          <Checkbox
                            id="dashboardHidden"
                            checked={!!field.value}
                            onCheckedChange={v => field.onChange(!!v)}
                          />
                        )}
                      />
                      <Label htmlFor="dashboardHidden" className="cursor-pointer font-normal">{t("seedBuilder.editor.dashHidden")}</Label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>{t("seedBuilder.editor.dashDescription")}</Label>
                    <Input {...register("dashboardDescription")} placeholder={t("seedBuilder.editor.dashDescriptionPlaceholder")} />
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{t("seedBuilder.editor.features")}</p>
                    {([
                      ["featSearch", "seedBuilder.editor.featSearch"],
                      ["featFilter", "seedBuilder.editor.featFilter"],
                      ["featExport", "seedBuilder.editor.featExport"],
                      ["featBulkDelete", "seedBuilder.editor.featBulkDelete"],
                    ] as const).map(([fieldName, labelKey]) => (
                      <div key={fieldName} className="flex items-center gap-2">
                        <Controller
                          name={fieldName}
                          control={control}
                          render={({ field: f }) => (
                            <Checkbox
                              id={fieldName}
                              checked={f.value !== false}
                              onCheckedChange={v => f.onChange(!!v)}
                            />
                          )}
                        />
                        <Label htmlFor={fieldName} className="cursor-pointer font-normal">{t(labelKey)}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : isEdit ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
