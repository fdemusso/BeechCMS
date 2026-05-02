import * as React from "react"
import type { Branch } from "@beech/core"
import { FieldEdit } from "@/components/fields/FieldEdit"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"

const RICHTEXT_BRANCH: Branch = {
  alias: "body",
  label: "Corpo del testo",
  type: "richtext",
}

export function TestFieldsPage() {
  const [html, setHtml] = React.useState<string>(
    "<h2>Titolo di esempio</h2><p>Scrivi qui il tuo contenuto <strong>ricco</strong>.</p><ul><li>Primo punto</li><li>Secondo punto</li></ul>"
  )

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="mx-auto w-full max-w-screen-2xl p-6 space-y-8">
              <div>
                <h1 className="text-2xl font-semibold">Field Playground</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Pagina di test per il campo <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">richtext</code>
                </p>
              </div>

              {/* Editor */}
              <section className="space-y-3">
                <h2 className="text-base font-medium">Edit — <span className="text-muted-foreground font-normal">FieldEdit type="richtext"</span></h2>
                <div className="max-w-2xl">
                  <FieldEdit
                    branch={RICHTEXT_BRANCH}
                    value={html}
                    onChange={(value) => setHtml(value as string)}
                  />
                </div>
              </section>

              {/* Preview HTML renderizzato */}
              <section className="space-y-3">
                <h2 className="text-base font-medium">Preview — <span className="text-muted-foreground font-normal">HTML compilato con stili applicati</span></h2>
                <div
                  className="richtext-content rounded-md border border-input bg-background px-4 py-3 max-w-2xl"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </section>

              {/* HTML raw output */}
              <section className="space-y-3">
                <h2 className="text-base font-medium">Output HTML grezzo</h2>
                <pre className="rounded-md border border-input bg-muted/30 px-4 py-3 text-xs font-mono whitespace-pre-wrap break-all max-w-2xl max-h-48 overflow-auto">
                  {html}
                </pre>
              </section>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
