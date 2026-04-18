import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { useRecentActivity } from "../hooks/use-dashboard-stats"

const ACTION_MAP = {
  create: "ha creato",
  update: "ha modificato",
  delete: "ha eliminato",
  upload: "ha caricato"
}

export function RecentActivity() {
  const { data: activities = [], isLoading } = useRecentActivity()

  return (
    <Card className="col-span-2 border-none bg-background/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Attività Recente</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {isLoading ? (
             <div className="flex flex-col items-center justify-center py-10 text-center">
               <p className="text-sm text-muted-foreground">Caricamento attività...</p>
             </div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4">
                <Avatar className="h-9 w-9 border border-primary/10">
                  <AvatarFallback className="bg-primary/5 text-primary text-xs">
                    {activity.user_email.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm leading-none text-muted-foreground">
                    <span className="font-bold text-foreground">{activity.user_email}</span>{" "}
                    {ACTION_MAP[activity.action] || activity.action}{" "}
                    <span className="font-semibold text-primary">
                      {activity.details?.title || activity.details?.name || activity.entity_slug || activity.entity_id}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {formatDistanceToNow(new Date(activity.created_at * 1000), { 
                      addSuffix: true, 
                      locale: it 
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
          {!isLoading && activities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">Nessuna attività recente registrata</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
