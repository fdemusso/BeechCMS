// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDistanceToNow } from "date-fns"
import { dateFnsLocaleFor } from "@/lib/date-locale"
import { useTranslation } from "react-i18next"
import { useRecentActivity } from "../hooks/use-dashboard-stats"
import { activityTarget } from "../utils/activity-target"
import { ActivitySentence } from "./activity-sentence"

export function RecentActivity() {
  const { data: activities = [], isLoading } = useRecentActivity()
  const { t, i18n } = useTranslation()
  const dateLocale = dateFnsLocaleFor(i18n.language)

  return (
    <Card className="col-span-2 border-none bg-background/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold">
          {t("dashboard.recentActivity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.recentActivity.loading")}
              </p>
            </div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4">
                <Avatar className="h-9 w-9 border border-primary/10">
                  <AvatarFallback className="bg-muted text-foreground text-xs">
                    {(activity.user_name || activity.user_email).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm leading-none text-muted-foreground">
                    <ActivitySentence
                      action={activity.action}
                      user={activity.user_name || activity.user_email}
                      target={activityTarget(activity)}
                      userClassName="font-bold text-foreground"
                      targetClassName="font-medium text-foreground"
                    />
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {formatDistanceToNow(new Date(activity.created_at * 1000), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
          {!isLoading && activities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.recentActivity.empty")}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
