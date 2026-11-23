// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineScript } from '../../../../../packages/cli/src/sdk/define-script'

/** Creates one article titled `--arg title=<value>`. */
export default defineScript(async (beech, { args }) => {
  const outcome = await beech.content.create('articles', { title: args.title })
  return outcome.kind === 'executed' ? { kind: outcome.kind, id: outcome.data.id } : { kind: outcome.kind }
})
