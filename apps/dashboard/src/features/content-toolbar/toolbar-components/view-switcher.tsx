// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import type { DashboardView } from "@beechcms/core";
import type { UserViewInstance } from "../shared";
import { moveViewId } from "../shared";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { viewTypeIcon } from "./view-type-catalogue";
import { ViewTypePicker } from "./view-type-picker";

const PICKER_TRIGGER_CLASSNAME =
  "opacity-0 group-hover/switcher:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity";

interface ViewSwitcherProps {
  readonly views: UserViewInstance[];
  /** null while the page shows the empty state of a type with no instance left. */
  readonly activeViewId: string | null;
  readonly onChangeView: (viewId: string) => void;
  /** Present only for users who may create views. */
  readonly onCreateView?: (type: DashboardView) => void;
  readonly creatableViewTypes?: readonly DashboardView[];
  /** Present only for users who may reorder views. */
  readonly onReorderViews?: (orderedIds: string[]) => void;
  /** Present only for users who may delete views; opens the same confirmation as the settings menu. */
  readonly onDeleteView?: (viewId: string) => void;
}

export function ViewSwitcher({
  views,
  activeViewId,
  onChangeView,
  onCreateView,
  creatableViewTypes,
  onReorderViews,
  onDeleteView,
}: ViewSwitcherProps) {
  const { t } = useTranslation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragIds = views.map((view) => view.id);
  const tableViewCount = views.filter((view) => view.type === "table").length;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const result = moveViewId(dragIds, String(active.id), over ? String(over.id) : null);
    if (result) onReorderViews?.(result);
  }

  return (
    <div className="group/switcher flex min-w-0 items-center gap-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={dragIds} strategy={horizontalListSortingStrategy}>
          <div
            role="tablist"
            aria-label={t("content.views.tabsLabel")}
            className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
          >
            {views.map((view) => (
              <SortableViewTab
                key={view.id}
                view={view}
                isActive={view.id === activeViewId}
                onSelect={() => onChangeView(view.id)}
                reorderEnabled={Boolean(onReorderViews)}
                onDelete={onDeleteView ? () => onDeleteView(view.id) : undefined}
                canDelete={!(view.type === "table" && tableViewCount <= 1)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {onCreateView && (
        <ViewTypePicker
          creatableViewTypes={creatableViewTypes ?? []}
          onCreateView={onCreateView}
          triggerClassName={PICKER_TRIGGER_CLASSNAME}
        />
      )}
    </div>
  );
}

interface SortableViewTabProps {
  view: UserViewInstance;
  isActive: boolean;
  onSelect: () => void;
  reorderEnabled: boolean;
  onDelete?: () => void;
  /** false when the view is the content type's only Table instance. */
  canDelete: boolean;
}

function SortableViewTab({ view, isActive, onSelect, reorderEnabled, onDelete, canDelete }: SortableViewTabProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.id,
    disabled: !reorderEnabled,
  });
  const { role: _role, ...restAttributes } = attributes;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = viewTypeIcon(view.type);

  const tab = (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      role="tab"
      aria-selected={isActive}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
        isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
      {...restAttributes}
      {...listeners}
      onClick={onSelect}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate max-w-32">{view.label}</span>
    </button>
  );

  if (!onDelete) return tab;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem variant="destructive" disabled={!canDelete} onSelect={onDelete}>
          <Trash2 className="size-4" />
          {t("content.views.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
