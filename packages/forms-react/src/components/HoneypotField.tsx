// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import { DEFAULT_HONEYPOT_NAME, HONEYPOT_CONTAINER_STYLE } from '../core/honeypot.js'
import type { HoneypotFieldProps } from '../types.js'

export type { HoneypotFieldProps } from '../types.js'

export const HoneypotField: FC<HoneypotFieldProps> = ({
  name,
  value,
  onChange,
  form,
  label,
}) => {
  const resolvedName = form ? form.honeypotName : (name || DEFAULT_HONEYPOT_NAME)
  const resolvedValue = form ? form.honeypotValue : (value || '')
  const resolvedOnChange = form ? form.setHoneypotValue : (onChange || (() => {}))
  const resolvedLabel = label || (form ? form.translations.honeypotLabel : 'Do not fill this field')

  return (
    <div style={HONEYPOT_CONTAINER_STYLE} aria-hidden="true" tabIndex={-1}>
      <label htmlFor={`beech-hp-${resolvedName}`}>{resolvedLabel}</label>
      <input
        id={`beech-hp-${resolvedName}`}
        type="text"
        name={resolvedName}
        value={resolvedValue}
        tabIndex={-1}
        autoComplete="off"
        onChange={(e) => resolvedOnChange(e.target.value)}
      />
    </div>
  )
}

export const Honeypot = HoneypotField

