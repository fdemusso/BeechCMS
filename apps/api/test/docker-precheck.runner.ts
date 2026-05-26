// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { assertDockerStackReady } from './docker-precheck'
export async function setup() { await assertDockerStackReady() }
