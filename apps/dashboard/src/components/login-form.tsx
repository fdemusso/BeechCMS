import { useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { Eye, EyeOff } from "lucide-react"
import { AUTH_TOKEN_KEY, type LoginResponse } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

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

interface LoginFormProps extends React.ComponentProps<"div"> {
  /** Classi CSS aggiuntive per il contenitore */
  className?: string
}

/**
 * Form di login con validazione client-side.
 *
 * - Errori mostrati inline sotto i campi
 * - Bottone Login disabilitato finché email e password non sono entrambi compilati
 * - Transizione visiva tra stato disabilitato (grigio) e attivo (accent)
 */
export function LoginForm({ className, ...props }: LoginFormProps) {
  const navigate = useNavigate()
  const [emailValue, setEmailValue] = useState("")
  const [passwordValue, setPasswordValue] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  /** Abilita il submit solo quando entrambi i campi hanno un valore */
  const isFormValid =
    emailValue.trim().length > 0 && passwordValue.trim().length > 0

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

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 shadow-md">
        <CardContent className="relative grid grid-cols-1 p-0 md:grid-cols-2">
          <img
            src="/undraw_clouds_bmtk.svg"
            alt=""
            className="absolute -left-30 -top-36 z-0 h-96 w-96 rotate-150 scale-x-[-1]"
            aria-hidden="true"
          />
          <img
            src="/sol.svg"
            alt=""
            className="absolute right-23 -top-28 z-0 hidden h-80 w-80 md:block md:h-[29rem] md:w-[28rem]"
            aria-hidden="true"
          />
          <form
            className="relative z-10 flex min-h-[36rem] flex-col justify-center p-6 md:p-8"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <FieldGroup className="w-full max-w-sm">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-semibold">
                    Welcome back
                  </h1>
                  <p className="text-muted-foreground text-balance text-sm">
                    Login to your Beech CMS account
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    autoComplete="username"
                    inputMode="email"
                    value={emailValue}
                    className={cn(emailError ? "border-destructive" : "")}
                    onChange={handleEmailChange}
                  />
                </Field>
                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <a
                      href="#"
                      className="ml-auto text-sm underline-offset-2 hover:underline"
                    >
                      Forgot your password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={isPasswordVisible ? "text" : "password"}
                      autoComplete="current-password"
                      value={passwordValue}
                      className={cn(
                        "pr-10",
                        passwordError && "border-destructive"
                      )}
                      onChange={handlePasswordChange}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent"
                      onClick={() => setIsPasswordVisible((prev) => !prev)}
                      aria-label={isPasswordVisible ? "Nascondi password" : "Mostra password"}
                    >
                      <span
                        key={isPasswordVisible ? "visible" : "hidden"}
                        className="inline-flex origin-center animate-[icon-swap_0.15s_ease-out]"
                      >
                        {isPasswordVisible ? (
                          <EyeOff className="text-muted-foreground size-4" />
                        ) : (
                          <Eye className="text-muted-foreground size-4" />
                        )}
                      </span>
                    </Button>
                  </div>
                  {(emailError || passwordError) && (
                    <FieldError>
                      {emailError || passwordError}
                    </FieldError>
                  )}
                </Field>
                <Field>
                  <Button
                    type="submit"
                    disabled={!isFormValid || isLoading}
                    className={cn(
                      "transition-colors duration-200 ease-out disabled:opacity-100",
                      isFormValid && !isLoading
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    {isLoading ? "Accesso in corso..." : "Login"}
                  </Button>
                </Field>
              </FieldGroup>
            </div>
          </form>
          <div className="relative hidden md:block md:min-h-[36rem] md:overflow-hidden">
            <img
              src="/undraw_enter_nwx3.svg"
              alt="Illustrazione area login"
              className="absolute -bottom-7 -right-28 h-full max-h-[42rem] w-full max-w-lg object-contain object-right-bottom scale-x-[-1] dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
