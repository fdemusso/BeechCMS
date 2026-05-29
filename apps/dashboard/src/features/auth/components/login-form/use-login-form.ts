// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { type LoginResponse } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"

/** Regex for email format validation */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Minimum password length (characters) */
const MIN_PASSWORD_LENGTH = 8

/** Maximum password length (characters) */
const MAX_PASSWORD_LENGTH = 128

/** Form validation error messages */
const ERROR_MESSAGES = {
  EMAIL_REQUIRED: "Email is required",
  EMAIL_INVALID: "Invalid email",
  PASSWORD_REQUIRED: "Password is required",
  PASSWORD_TOO_SHORT: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  PASSWORD_TOO_LONG: `Password cannot exceed ${MAX_PASSWORD_LENGTH} characters`,
  CREDENTIALS_INVALID: "Invalid email or password",
} as const

export function useLoginForm() {
  const navigate = useNavigate()
  const { setToken } = useAuth()
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

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
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
      // Use direct axios for /auth/login (does not go through baseURL '/api')
      const { data } = await axios.post<LoginResponse>('/auth/login', { email, password }, {
        withCredentials: true, // Required to receive refresh_token cookie
      })
      setToken(data.token)
      setIsLoading(false)
      navigate('/', { replace: true })
    } catch (error) {
      setIsLoading(false)
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setPasswordError(ERROR_MESSAGES.CREDENTIALS_INVALID)
        } else {
          // Handle other errors (network, 500, etc.)
          setPasswordError('Login error. Please try again later.')
        }
      } else {
        setPasswordError('Connection error. Please check your internet connection.')
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
