import { useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { Seed } from "@beechcms/core"
import { getGroupableColumns } from "../shared"
export interface DateGroupPrecision {
  year: boolean
  month: boolean
  day: boolean
}
export type DatePrecisionMode = "day" | "year" | "monthYear"

interface UseToolbarGroupByProps {
  seed: Seed
  availableStatusOptions: string[]
  groupBy: string | null
  dateGroupPrecision: DateGroupPrecision
  onDateGroupPrecisionChange?: (precision: DateGroupPrecision) => void
}

export function useToolbarGroupBy({
  seed,
  availableStatusOptions,
  groupBy,
  dateGroupPrecision,
  onDateGroupPrecisionChange,
}: UseToolbarGroupByProps) {
  const { t } = useTranslation()
  const groupableColumns = useMemo(
    () => getGroupableColumns(seed, availableStatusOptions, t("content.table.status")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availableStatusOptions, seed, t]
  )

  const recommendedGroupColumns = useMemo(
    () => groupableColumns.filter((c) => c.section === "recommended"),
    [groupableColumns]
  )

  const otherGroupColumns = useMemo(
    () => groupableColumns.filter((c) => c.section === "other"),
    [groupableColumns]
  )

  const activeGroupLabel = useMemo(() => {
    if (!groupBy) return null
    return groupableColumns.find((c) => c.columnId === groupBy)?.label ?? groupBy
  }, [groupBy, groupableColumns])

  /**
   * Deriva una modalità unica dalla precisione corrente.
   * - day: giorno (con anno) — esclusivo
   * - year: solo anno
   * - monthYear: mese + anno (default)
   */
  const datePrecisionMode: DatePrecisionMode = useMemo(() => {
    if (dateGroupPrecision.day) return "day"
    if (dateGroupPrecision.year && dateGroupPrecision.month) return "monthYear"
    if (dateGroupPrecision.year && !dateGroupPrecision.month) return "year"
    // fallback: qualsiasi stato “strano” lo normalizziamo al default richiesto
    return "monthYear"
  }, [dateGroupPrecision.day, dateGroupPrecision.month, dateGroupPrecision.year])

  const applyDatePrecisionMode = useCallback(
    (mode: DatePrecisionMode) => {
      if (!onDateGroupPrecisionChange) return
      if (mode === "day") {
        onDateGroupPrecisionChange({ year: false, month: false, day: true })
        return
      }
      if (mode === "year") {
        onDateGroupPrecisionChange({ year: true, month: false, day: false })
        return
      }
      onDateGroupPrecisionChange({ year: true, month: true, day: false })
    },
    [onDateGroupPrecisionChange]
  )

  return {
    groupableColumns,
    recommendedGroupColumns,
    otherGroupColumns,
    activeGroupLabel,
    datePrecisionMode,
    applyDatePrecisionMode,
  }
}
