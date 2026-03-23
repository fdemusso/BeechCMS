import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { AUTH_TOKEN_KEY, type LoginResponse } from "@/lib/api"

/** Regex per validazione formato email */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lunghezza minima password (caratteri) */
const MIN_PASSWORD_LENGTH = 8

/** Lunghezza massima password (caratteri) */
const MAX_PASSWORD_LENGTH = 128

/** Messaggi di errore per validazione form */
const ERROR_MESSAGES = {
  EMAIL_REQUIRED: "Inserisci l'email",
  EMAIL_INVALID: "Email non valida",
  PASSWORD_REQUIRED: "Inserisci la password",
  PASSWORD_TOO_SHORT: `La password deve essere almeno ${MIN_PASSWORD_LENGTH} caratteri`,
  PASSWORD_TOO_LONG: `La password non può superare i ${MAX_PASSWORD_LENGTH} caratteri`,
  CREDENTIALS_INVALID: "Email o Password errate",
} as const

export function useLoginForm() {
  const navigate = useNavigate()
  const [emailValue, setEmailValue] = useState("")
  const [passwordValue, setPasswordValue] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isFormValid =
    emailValue.trim().length > 0 && passwordValue.trim().length > 0

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setEmailValue(event.target.value)
    setEmailError(null)
    setPasswordError(null)
  }

  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setPasswordValue(event.target.value)
    setPasswordError(null)
    setEmailError(null)
  }

  const togglePasswordVisibility = () => setIsPasswordVisible((prev) => !prev)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const email = emailValue.trim()
    const password = passwordValue

    setEmailError(null)
    setPasswordError(null)

    if (!email) {
      setEmailError(ERROR_MESSAGES.EMAIL_REQUIRED)
      return
    }
    if (!EMAIL_REGEX.test(email)) {
      setEmailError(ERROR_MESSAGES.EMAIL_INVALID)
      return
    }
    if (!password) {
      setPasswordError(ERROR_MESSAGES.PASSWORD_REQUIRED)
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(ERROR_MESSAGES.PASSWORD_TOO_SHORT)
      return
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      setPasswordError(ERROR_MESSAGES.PASSWORD_TOO_LONG)
      return
    }

    setIsLoading(true)
    try {
      // Usa axios diretto per /auth/login (non passa da baseURL '/api')
      const { data } = await axios.post<LoginResponse>('/auth/login', { email, password }, {
        withCredentials: true, // Necessario per ricevere refresh_token cookie
      })
      // TODO(security): il token è salvato in localStorage per semplicità UX.
      // Valutare in futuro alternative più resistenti a XSS (es. sessione cookie-only).
      localStorage.setItem(AUTH_TOKEN_KEY, data.token)
      setIsLoading(false)
      navigate('/', { replace: true })
    } catch (error) {
      setIsLoading(false)
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setPasswordError(ERROR_MESSAGES.CREDENTIALS_INVALID)
        } else {
          // Gestione altri errori (network, 500, etc.)
          setPasswordError('Errore durante il login. Riprova più tardi.')
        }
      } else {
        setPasswordError('Errore di connessione. Verifica la tua connessione internet.')
      }
    }
  }

  return {
    emailValue,
    passwordValue,
    isPasswordVisible,
    emailError,
    passwordError,
    isLoading,
    isFormValid,
    handleEmailChange,
    handlePasswordChange,
    togglePasswordVisibility,
    handleSubmit,
  }
}
