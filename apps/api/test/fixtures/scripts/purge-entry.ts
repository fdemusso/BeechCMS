// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineScript } from '../../../../../packages/cli/src/sdk/define-script'

/** Permanently deletes the article `--arg id=<value>`; the CLI token turns that into a pending intent. */
export default defineScript(async (beech, { args, log }) => {
  const outcome = await beech.content.delete('articles', args.id, { purge: 'true' })
  log('purge outcome:', outcome.kind)
  return outcome.kind
})
