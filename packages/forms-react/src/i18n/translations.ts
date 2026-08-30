// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FormTranslations, Locale } from '../types.js'

export const translationsIT: FormTranslations = {
  submitButton: 'Invia richiesta',
  submittingButton: 'Invio in corso...',
  successTitle: 'Messaggio inviato con successo',
  successMessage: 'Grazie per averci contattato. Ti risponderemo al più presto.',
  errorTitle: 'Errore durante l\'invio',
  genericErrorMessage: 'Si è verificato un errore durante l\'invio del form. Riprova più tardi.',
  requiredField: 'Questo campo è obbligatorio',
  invalidEmail: 'Inserisci un indirizzo email valido',
  invalidNumber: 'Inserisci un valore numerico valido',
  invalidFileType: 'Formato file non valido o firma non corrispondente',
  fileTooLarge: (maxMb) => `La dimensione del file supera il limite massimo di ${maxMb}MB`,
  draftRestored: 'Bozza precedente ripristinata automaticamente',
  timeTrapWarning: 'Compilazione troppo rapida. Attendi un secondo prima di inviare.',
  honeypotLabel: 'Non compilare questo campo',
}

export const translationsEN: FormTranslations = {
  submitButton: 'Submit Request',
  submittingButton: 'Submitting...',
  successTitle: 'Message sent successfully',
  successMessage: 'Thank you for reaching out. We will get back to you soon.',
  errorTitle: 'Submission Error',
  genericErrorMessage: 'An error occurred while submitting the form. Please try again.',
  requiredField: 'This field is required',
  invalidEmail: 'Please enter a valid email address',
  invalidNumber: 'Please enter a valid number',
  invalidFileType: 'Invalid file type or mismatched signature',
  fileTooLarge: (maxMb) => `File size exceeds the maximum limit of ${maxMb}MB`,
  draftRestored: 'Previous draft restored automatically',
  timeTrapWarning: 'Submission too fast. Please wait a second before submitting.',
  honeypotLabel: 'Do not fill this field',
}

export function getTranslations(locale: Locale = 'it', custom?: Partial<FormTranslations>): FormTranslations {
  const base = locale === 'en' ? translationsEN : translationsIT
  return { ...base, ...custom }
}
