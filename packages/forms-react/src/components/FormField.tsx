// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import type { FormBranchSchema, UseBeechFormReturn } from '../types.js'

export interface FormFieldProps {
  branch: FormBranchSchema
  form: UseBeechFormReturn
  className?: string
}

export const FormField: FC<FormFieldProps> = ({ branch, form, className = 'beech-form-field' }) => {
  if (!form.isFieldVisible(branch.alias)) {
    return null
  }

  const { alias, label, type, placeholder, options, helpText } = branch
  const reg = form.register(alias)
  const error = form.touched[alias] ? form.errors[alias] : undefined
  const fieldId = `beech-field-${alias}`

  return (
    <div className={className} data-field={alias} data-type={type}>
      {label && (
        <label htmlFor={fieldId} className="beech-label">
          {label}
          {branch.required && <span className="beech-required-mark" aria-hidden="true"> *</span>}
        </label>
      )}

      {type === 'text' ? (
        <textarea
          id={fieldId}
          placeholder={placeholder}
          className={`beech-input beech-textarea ${error ? 'beech-input-error' : ''}`}
          {...reg}
        />
      ) : type === 'select' ? (
        <select
          id={fieldId}
          className={`beech-input beech-select ${error ? 'beech-input-error' : ''}`}
          {...reg}
        >
          <option value="">{placeholder || '-- Seleziona --'}</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : type === 'boolean' ? (
        <div className="beech-checkbox-wrapper">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(form.values[alias])}
            className="beech-checkbox"
            name={reg.name}
            onChange={reg.onChange}
            onBlur={reg.onBlur}
            aria-invalid={reg['aria-invalid']}
            aria-required={reg['aria-required']}
            aria-describedby={reg['aria-describedby']}
          />
          {placeholder && <label htmlFor={fieldId}>{placeholder}</label>}
        </div>
      ) : type === 'file' ? (
        <input
          id={fieldId}
          type="file"
          accept={branch.accept}
          className={`beech-input beech-file ${error ? 'beech-input-error' : ''}`}
          onChange={(e) => form.handleFileChange(alias, e.target.files?.[0] ?? null)}
          onBlur={reg.onBlur}
          aria-invalid={reg['aria-invalid']}
          aria-required={reg['aria-required']}
          aria-describedby={reg['aria-describedby']}
        />
      ) : (
        <input
          id={fieldId}
          type={type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          placeholder={placeholder}
          className={`beech-input ${error ? 'beech-input-error' : ''}`}
          {...reg}
        />
      )}

      {helpText && <p className="beech-help-text">{helpText}</p>}
      {error && (
        <p id={`${alias}-error`} className="beech-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
