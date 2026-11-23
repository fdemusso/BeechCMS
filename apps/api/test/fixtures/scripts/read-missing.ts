// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineScript } from '../../../../../packages/cli/src/sdk/define-script'

/** Reads the article `--arg id=<value>`; used with an id that does not exist. */
export default defineScript((beech, { args }) => beech.content.get('articles', args.id))
