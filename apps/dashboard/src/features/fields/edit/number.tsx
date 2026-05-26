// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { FieldEditProps } from "../types"
import { NumberInput } from "./number-input"
import { NumberSlider } from "./number-slider"
import { NumberRating } from "./number-rating"
import { NumberStepper } from "./number-stepper"

export function NumberEdit({ branch, value, onChange }: FieldEditProps) {
  const control = branch.numberOptions?.control ?? "input"

  switch (control) {
    case "slider":
      return <NumberSlider branch={branch} value={value} onChange={onChange} />
    case "rating":
      return <NumberRating branch={branch} value={value} onChange={onChange} />
    case "stepper":
      return <NumberStepper branch={branch} value={value} onChange={onChange} />
    default:
      return <NumberInput branch={branch} value={value} onChange={onChange} />
  }
}
