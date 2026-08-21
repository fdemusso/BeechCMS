// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { BeechForm } from './components/BeechForm.js'
export { FormField } from './components/FormField.js'
export { HoneypotField, Honeypot } from './components/HoneypotField.js'
export { useBeechForm } from './hooks/useBeechForm.js'
export { evaluateCondition, evaluateSingleCondition } from './core/conditional-logic.js'
export { saveFormDraft, loadFormDraft, clearFormDraft, getDraftStorageKey } from './core/draft-storage.js'
export { fetchTimeTrapToken } from './core/time-trap.js'
export { verifyClientMagicBytes, fileToAttachment, type ClientMagicBytesResult } from './core/file-uploader.js'
export { translationsIT, translationsEN, getTranslations } from './i18n/translations.js'
export { DEFAULT_HONEYPOT_NAME, HONEYPOT_DECOYS, HONEYPOT_CONTAINER_STYLE } from './core/honeypot.js'
export type {
  BeechFormProps,
  UseBeechFormOptions,
  UseBeechFormReturn,
  FormFieldProps,
  HoneypotFieldProps,
  FormSeedSchema,
  FormBranchSchema,
  FormBranchType,
  ConditionalRule,
  ConditionalOperator,
  FormFileAttachment,
  FormTranslations,
  Locale,
} from './types.js'
