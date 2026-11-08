// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Camera, Loader as Loader2, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { isApiError } from '@/lib/http/api-error'
import { useProfile, useUpdateProfile, useChangePassword, useUpdateAvatar, useRemoveAvatar } from '../hooks/use-settings'
import { SettingsActions, SettingsRow, SettingsSection } from './settings-section'

function getInitials(name: string | null, surname: string | null, email: string): string {
  if (name || surname) {
    const parts = []
    if (name) parts.push(name.trim())
    if (surname) parts.push(surname.trim())
    return parts.map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }
  return email.slice(0, 2).toUpperCase()
}

/** Photo, name, last name and email: one row each. */
export function ProfileSection() {
  const { t } = useTranslation()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const updateAvatar = useUpdateAvatar()
  const removeAvatar = useRemoveAvatar()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [name, setName] = React.useState('')
  const [surname, setSurname] = React.useState('')
  const [email, setEmail] = React.useState('')

  React.useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setSurname(profile.surname ?? '')
      setEmail(profile.email)
    }
  }, [profile])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile.mutateAsync({
        name,
        surname,
        email: email || undefined,
      })
      toast.success(t('settings.profile.savedSuccess'))
    } catch (err) {
      const detail = (isApiError(err) ? err.data?.detail : undefined) ?? t('settings.profile.savedError')
      toast.error(detail)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await updateAvatar.mutateAsync(file)
      toast.success(t('settings.profile.avatarSuccess'))
    } catch {
      toast.error(t('settings.profile.avatarError'))
    }
    e.target.value = ''
  }

  const handleRemoveAvatar = async () => {
    try {
      await removeAvatar.mutateAsync()
      toast.success(t('settings.profile.avatarRemoved'))
    } catch {
      toast.error(t('settings.profile.avatarRemoveError'))
    }
  }

  const photoBusy = updateAvatar.isPending || removeAvatar.isPending

  return (
    <SettingsSection id="profile" title={t('settings.profile.infoTitle')} description={t('settings.profile.infoDesc')}>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={handleSaveProfile}>
          <SettingsRow label={t('settings.profile.photoLabel')} controlClassName="sm:w-auto">
            <div className="relative w-fit sm:ml-auto">
              {/* The circle is the button: hovering it (or focusing it) reveals the camera over the photo. */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoBusy}
                aria-label={t('settings.profile.changePhoto')}
                title={t('settings.profile.changePhoto')}
                className="group relative block rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar className="size-16">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(profile?.name ?? null, profile?.surname ?? null, profile?.email ?? '')}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={
                    'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white transition-opacity ' +
                    (updateAvatar.isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')
                  }
                >
                  {updateAvatar.isPending ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                </span>
              </button>
              {profile?.hasCustomAvatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={photoBusy}
                  aria-label={t('settings.profile.removePhoto')}
                  title={t('settings.profile.removePhoto')}
                  className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs outline-hidden transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {removeAvatar.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.profile.nameLabel')} htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('settings.profile.namePlaceholder')}
            />
          </SettingsRow>

          <SettingsRow label={t('settings.profile.surnameLabel')} htmlFor="surname">
            <Input
              id="surname"
              value={surname}
              onChange={e => setSurname(e.target.value)}
              placeholder={t('settings.profile.surnamePlaceholder')}
            />
          </SettingsRow>

          <SettingsRow label={t('settings.profile.emailLabel')} htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('settings.profile.emailPlaceholder')}
            />
          </SettingsRow>

          <SettingsActions>
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('settings.profile.saveChanges')}
            </Button>
          </SettingsActions>
        </form>
      )}
    </SettingsSection>
  )
}

/** Current password, new password and its confirmation: one row each. */
export function PasswordSection() {
  const { t } = useTranslation()
  const changePassword = useChangePassword()
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.profile.passwordMismatch'))
      return
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      toast.success(t('settings.profile.passwordSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      const detail = (isApiError(err) ? err.data?.detail : undefined) ?? t('settings.profile.passwordError')
      toast.error(detail)
    }
  }

  return (
    <SettingsSection id="password" title={t('settings.profile.passwordTitle')} description={t('settings.profile.passwordDesc')}>
      <form onSubmit={handleChangePassword}>
        <SettingsRow label={t('settings.profile.currentPassword')} htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </SettingsRow>

        <SettingsRow label={t('settings.profile.newPassword')} htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </SettingsRow>

        <SettingsRow label={t('settings.profile.confirmPassword')} htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </SettingsRow>

        <SettingsActions>
          <Button type="submit" variant="outline" disabled={changePassword.isPending}>
            {changePassword.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('settings.profile.updatePassword')}
          </Button>
        </SettingsActions>
      </form>
    </SettingsSection>
  )
}

/** Profile and password, in page order. */
export function ProfileTab() {
  return (
    <>
      <ProfileSection />
      <PasswordSection />
    </>
  )
}
