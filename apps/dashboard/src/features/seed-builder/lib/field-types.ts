// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { BranchType, DataClassification } from "@beechcms/core"
import {
  Calendar, CheckCircle, Code, Document, FileText, Globe, Hashtag, Image, Key, Layers, Link, Lock, Shield, Tag,
  type IconProps,
} from "@/components/icons"
import type { ComponentType } from "react"

type Icon = ComponentType<IconProps>

/** Field types in the order the quick-add chooser shows them: the common ones first. */
export const FIELD_TYPES: readonly BranchType[] = [
  "text", "richtext", "number", "boolean", "date", "tags", "file", "relation", "json", "repeater",
]

export const FIELD_TYPE_ICONS: Record<BranchType, Icon> = {
  text: Document,
  richtext: FileText,
  number: Hashtag,
  boolean: CheckCircle,
  date: Calendar,
  json: Code,
  tags: Tag,
  file: Image,
  relation: Link,
  repeater: Layers,
}

/** One icon per privacy tier, from open (globe) to sealed (key). */
export const CLASSIFICATION_ICONS: Record<DataClassification, Icon> = {
  public: Globe,
  internal: Shield,
  confidential: Lock,
  restricted: Key,
}
