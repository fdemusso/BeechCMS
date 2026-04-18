import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"

interface ActivityItem {
  id: string
  user: {
    name: string
    image?: string
    initials: string
  }
  action: string
  target: string
  timestamp: Date
}

interface RecentActivityProps {
  activities: ActivityItem[]
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card className="col-span-2 border-none bg-background/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Attività Recente</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center gap-4">
              <Avatar className="h-9 w-9 border">
                <AvatarImage src={activity.user.image} alt={activity.user.name} />
                <AvatarFallback>{activity.user.initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-sm font-medium leading-none">
                  <span className="font-bold">{activity.user.name}</span> {activity.action}{" "}
                  <span className="font-semibold text-primary">{activity.target}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(activity.timestamp, { addSuffix: true, locale: it })}
                </p>
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">Nessuna attività recente</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
