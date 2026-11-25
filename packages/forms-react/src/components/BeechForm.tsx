// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import type { BeechFormProps } from '../types.js'
import { useBeechForm } from '../hooks/useBeechForm.js'
import { Honeypot } from './HoneypotField.js'
import { FormField } from './FormField.js'

export const BeechForm: FC<BeechFormProps> = (props) => {
  const { className = 'beech-form', children, ...options } = props
  const form = useBeechForm(options)
  const schema = form.schema

  return (
    <form className={className} onSubmit={form.handleSubmit} noValidate>
      {/* Camouflage Honeypot Decoy */}
      <Honeypot form={form} />

      {/* Draft Restored Banner */}
      {form.isDraftRestored && !form.isSuccess && (
        <div className="beech-alert beech-alert-info" role="status">
          <span>{form.translations.draftRestored}</span>
          <button type="button" onClick={form.clearDraft} className="beech-btn-link" aria-label={form.translations.dismissDraft}>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      {/* Server Error Banner */}
      {form.serverError && (
        <div className="beech-alert beech-alert-error" role="alert">
          <strong>{form.translations.errorTitle}: </strong>
          <span>{form.serverError}</span>
        </div>
      )}

      {/* Schema Loading State */}
      {form.isLoadingSchema ? (
        <div className="beech-loading-schema" role="status" aria-live="polite" aria-busy="true">
          <span className="beech-spinner" aria-hidden="true" />
          {form.translations.loadingForm}
        </div>
      ) : form.isSuccess ? (
        <div className="beech-alert beech-alert-success" role="status">
          <h3>{form.translations.successTitle}</h3>
          <p>{form.translations.successMessage}</p>
        </div>
      ) : typeof children === 'function' ? (
        children(form)
      ) : children ? (
        children
      ) : schema ? (
        <>
          {schema.branches.map((branch) => (
            <FormField key={branch.alias} branch={branch} form={form} />
          ))}
          <button type="submit" disabled={form.isSubmitting} className="beech-submit-btn">
            {form.isSubmitting ? form.translations.submittingButton : form.translations.submitButton}
          </button>
        </>
      ) : null}
    </form>
  )
}
