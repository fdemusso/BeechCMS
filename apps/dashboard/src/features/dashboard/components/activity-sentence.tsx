// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Trans } from "react-i18next"

interface ActivitySentenceProps {
  /** Backend action enum value (`create`, `discard_draft`, …): the last-but-one segment of the i18n key. */
  action: string
  user: string
  target: string
  className?: string
  userClassName?: string
  targetClassName?: string
}

/**
 * One full, translatable sentence for an activity row ("{user} moved {target} to the Trash"). The verb
 * and the two highlighted parts live in a single string, so each locale decides word order.
 */
export function ActivitySentence({ action, user, target, className, userClassName, targetClassName }: ActivitySentenceProps) {
  return (
    <span className={className}>
      <Trans
        i18nKey={`dashboard.recentActivity.entry.${action}.sentence`}
        defaults="<user>{{user}}</user> {{action}} <target>{{target}}</target>"
        values={{ user, target, action }}
        // user and target are free text: escape them so a name like "<target>" cannot open a tag, then decode the entities back.
        tOptions={{ interpolation: { escapeValue: true } }}
        shouldUnescape
        components={{
          user: <span className={userClassName} />,
          target: <span className={targetClassName} />,
        }}
      />
    </span>
  )
}
