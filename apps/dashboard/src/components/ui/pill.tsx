// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Pill — rounded chip with up to two independent actions.
 *
 *   ┌──────────────────────────┐
 *   │ [icon] label  trailing ✕ │   ✕ = secondary action
 *   └──────────────────────────┘
 *     └─ main button ─┘
 *
 * - Primary action: pressing the pill itself (`onClick`).
 * - Secondary action: pressing the icon button (`action`), revealed on hover/focus
 *   with an animation, or always visible when `animated={false}`.
 *
 * Both actions are optional; a pill with neither is a plain, non-interactive label.
 *
 * @example Filter pill: opens a menu, trash icon removes it
 * <DropdownMenuTrigger asChild>
 *   <Pill
 *     label="Status"
 *     trailing={3}
 *     action={{ icon: <Trash2 />, label: "Remove filter", tone: "destructive", onClick: remove }}
 *   />
 * </DropdownMenuTrigger>
 *
 * @example Static pill with an always-visible dismiss icon
 * <Pill label="Draft" animated={false} action={{ icon: <X />, label: "Dismiss", onClick: dismiss }} />
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader as Loader2 } from "reicon-react"

import { cn } from "@/lib/utils"

/**
 * Styles of the pill container.
 * `group` lets children react to the container's hover/focus state (reveal animation).
 */
const pillVariants = cva(
  "group relative inline-flex h-8 max-w-full items-center rounded-full text-xs transition-colors",
  {
    variants: {
      /** Colour scheme. */
      variant: {
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border bg-transparent text-foreground",
        primary: "bg-primary text-primary-foreground",
        destructive: "bg-destructive/10 text-destructive",
      },
      /** Highlights the pill, e.g. while its menu is open. */
      selected: {
        true: "ring-2 ring-ring/50",
        false: "",
      },
      /** Dimmed and unclickable. Set by the component for both `disabled` and `loading`. */
      disabled: {
        true: "pointer-events-none opacity-50",
        false: "",
      },
    },
    defaultVariants: {
      variant: "secondary",
      selected: false,
      disabled: false,
    },
  }
)

/** Hover colours of the secondary-action button, keyed by `PillAction.tone`. */
const actionToneClasses = {
  default: "hover:bg-foreground/10",
  destructive: "text-destructive hover:bg-destructive/10",
} as const

/** Secondary action: an icon-only button attached to the pill. */
interface PillAction {
  /** Icon rendered inside the button. Any node: pass an icon component instance. */
  readonly icon: React.ReactNode
  /** Accessible name. Required because the button has no visible text. */
  readonly label: string
  /** Called on press. The click never bubbles to the pill, so the primary action does not fire. */
  readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  /** Visual tone of the button. Defaults to `"default"`. */
  readonly tone?: keyof typeof actionToneClasses
  /** Disables only this action; the primary action stays available. */
  readonly disabled?: boolean
}

interface PillProps
  extends Omit<React.ComponentProps<"button">, "children" | "className" | "onClick">,
    Omit<VariantProps<typeof pillVariants>, "disabled"> {
  /** Main text of the pill. */
  readonly label: React.ReactNode
  /** Leading icon. Replaced by a spinner while `loading`. */
  readonly icon?: React.ReactNode
  /** Secondary content after the label (e.g. a counter). Fades out while the action is revealed. */
  readonly trailing?: React.ReactNode
  /** Primary action, fired by pressing the pill. When omitted (and no extra button props are passed) the pill is not interactive. */
  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  /** Secondary action. When omitted no icon button is rendered. */
  readonly action?: PillAction
  /**
   * `true` (default): the action icon is hidden and revealed with an animation on hover/focus.
   * `false`: no animation, the action icon is always visible.
   * Has no effect without `action`.
   */
  readonly animated?: boolean
  /** Disables both actions and dims the pill. */
  readonly disabled?: boolean
  /** Shows a spinner instead of `icon` and disables both actions. */
  readonly loading?: boolean
  /** Extra classes for the container. */
  readonly className?: string
  /** Extra classes for the main (label) button. */
  readonly mainClassName?: string
}

/**
 * Reusable pill with a primary action (the pill) and an optional secondary action (an icon).
 *
 * Extra props and `ref` are forwarded to the main button. This makes the pill usable as a
 * Radix trigger (`<DropdownMenuTrigger asChild><Pill … /></DropdownMenuTrigger>`): the trigger
 * injects its handlers and ARIA attributes, which land on the main button, not on the container.
 */
function Pill({
  label,
  icon,
  trailing,
  onClick,
  action,
  animated = true,
  variant,
  selected,
  disabled = false,
  loading = false,
  className,
  mainClassName,
  type = "button",
  ...buttonProps
}: PillProps) {
  const isDisabled = disabled || loading
  const hasAction = action !== undefined

  // The padding/trailing animation only applies when there is an action to reveal.
  const revealOnHover = hasAction && animated

  // Props injected by a Radix `asChild` trigger arrive in `buttonProps` without an `onClick`,
  // so their presence also means the main area must be a real button.
  const isInteractive = onClick !== undefined || Object.keys(buttonProps).length > 0

  const content = (
    <>
      {loading ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : icon}
      <span className="truncate">{label}</span>
      {trailing !== undefined && (
        <span
          className={cn(
            "opacity-70 transition-opacity duration-150",
            // Make room for the action icon, which takes the trailing slot's place.
            revealOnHover && "group-hover:opacity-0 group-focus-within:opacity-0"
          )}
        >
          {trailing}
        </span>
      )}
    </>
  )

  const mainClasses = cn(
    "flex h-full min-w-0 items-center gap-1.5 rounded-full pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    // Static action sits inline (tight padding); animated action is absolutely positioned
    // and gets its room by growing the right padding on hover (`pr-7` ≈ size-6 icon + gap).
    hasAction && !animated ? "pr-1" : "pr-3",
    revealOnHover && "transition-[padding] duration-200 ease-in-out group-hover:pr-7 group-focus-within:pr-7",
    isInteractive && "cursor-pointer",
    mainClassName
  )

  return (
    <div
      data-slot="pill"
      data-animated={animated}
      className={cn(pillVariants({ variant, selected, disabled: isDisabled }), className)}
    >
      {isInteractive ? (
        <button
          type={type}
          data-slot="pill-main"
          disabled={isDisabled}
          className={mainClasses}
          onClick={onClick}
          {...buttonProps}
        >
          {content}
        </button>
      ) : (
        <span data-slot="pill-main" className={mainClasses}>
          {content}
        </span>
      )}

      {action && (
        // Sibling of the main button (not a child): nesting buttons is invalid HTML.
        <button
          type="button"
          data-slot="pill-action"
          aria-label={action.label}
          disabled={isDisabled || action.disabled}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            actionToneClasses[action.tone ?? "default"],
            animated
              ? // Delay on hover so the padding animation opens the space before the icon fades in.
                "absolute right-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-100 focus-visible:opacity-100 group-focus-within:opacity-100"
              : "mr-1"
          )}
          onClick={(event) => {
            // The action must not trigger the primary action or a parent trigger.
            event.stopPropagation()
            action.onClick(event)
          }}
        >
          {action.icon}
        </button>
      )}
    </div>
  )
}

export { Pill, pillVariants }
export type { PillProps, PillAction }
