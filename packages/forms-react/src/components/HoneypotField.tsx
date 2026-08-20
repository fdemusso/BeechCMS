// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import { HONEYPOT_CONTAINER_STYLE } from '../core/honeypot.js'

export interface HoneypotFieldProps {
  name: string
  value: string
  onChange: (value: string) => void
  label?: string
}

export const HoneypotField: FC<HoneypotFieldProps> = ({
  name,
  value,
  onChange,
  label = 'Do not fill this field',
}) => {
  return (
    <div style={HONEYPOT_CONTAINER_STYLE} aria-hidden="true" tabIndex={-1}>
      <label htmlFor={`beech-hp-${name}`}>{label}</label>
      <input
        id={`beech-hp-${name}`}
        type="text"
        name={name}
        value={value}
        tabIndex={-1}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
