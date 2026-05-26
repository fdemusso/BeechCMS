// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useProfile, useUpdateProfile, useChangePassword, useUpdateAvatar } from '../hooks/use-settings'

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return email.slice(0, 2).toUpperCase()
}

export function ProfileTab() {
  const { t } = useTranslation()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const updateAvatar = useUpdateAvatar()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  React.useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setEmail(profile.email)
    }
  }, [profile])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile.mutateAsync({ name: name || undefined, email: email || undefined })
      toast.success(t('settings.profile.savedSuccess'))
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? t('settings.profile.savedError')
      toast.error(detail)
    }
  }

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
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? t('settings.profile.passwordError')
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profile.infoTitle')}</CardTitle>
          <CardDescription>{t('settings.profile.infoDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="size-20">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(profile?.name ?? null, profile?.email ?? '')}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={updateAvatar.isPending}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {updateAvatar.isPending
                    ? <Loader2 className="size-5 text-white animate-spin" />
                    : <Camera className="size-5 text-white" />
                  }
                </button>
              </div>
              <div>
                <p className="text-sm font-medium">{profile?.name ?? t('settings.profile.noName')}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  {t('settings.profile.changePhoto')}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('settings.profile.nameLabel')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('settings.profile.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('settings.profile.emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('settings.profile.emailPlaceholder')}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.profile.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profile.passwordTitle')}</CardTitle>
          <CardDescription>{t('settings.profile.passwordDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t('settings.profile.currentPassword')}</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t('settings.profile.newPassword')}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t('settings.profile.confirmPassword')}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={changePassword.isPending}>
                {changePassword.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.profile.updatePassword')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
