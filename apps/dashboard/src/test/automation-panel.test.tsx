import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AutomationPanel } from "../features/automations/components/automation-panel/automation-panel"
import { ContentToolbar } from "../features/content-toolbar/content-toolbar"
import { TooltipProvider } from "@/components/ui/tooltip"

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { name: "Test User", email: "test@example.com" } }),
}))

// We will dynamically control the return value of useAutomations in tests
const mockUseAutomations = vi.fn().mockReturnValue({ data: [], isLoading: false })
vi.mock("../features/automations/hooks/use-automations", () => ({
  useAutomations: (...args: any[]) => mockUseAutomations(...args),
}))

vi.mock("../features/automations/hooks/use-toggle-automation", () => ({
  useToggleAutomation: () => ({ isPending: false, mutate: vi.fn() }),
}))

vi.mock("../features/automations/hooks/use-delete-automation", () => ({
  useDeleteAutomation: () => ({ isPending: false, mutate: vi.fn() }),
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

describe("AutomationPanel rendering", () => {
  it("renders empty state without crashing when open is true", () => {
    mockUseAutomations.mockReturnValue({ data: [], isLoading: false })
    render(
      <QueryClientProvider client={queryClient}>
        <AutomationPanel
          open={true}
          onOpenChange={vi.fn()}
          seedSlug="posts"
          seedDisplayName="Posts"
          seedBranches={[]}
        />
      </QueryClientProvider>
    )
  })

  it("renders automations list without crashing when open is true and there are automations", () => {
    mockUseAutomations.mockReturnValue({
      data: [
        {
          id: "aut-1",
          name: "My Custom Automation",
          enabled: true,
          triggers: [{ event: "create" }],
          actions: [{ type: "send_mail", to: "test@example.com" }],
        },
      ],
      isLoading: false,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <AutomationPanel
          open={true}
          onOpenChange={vi.fn()}
          seedSlug="posts"
          seedDisplayName="Posts"
          seedBranches={[]}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText("My Custom Automation")).toBeInTheDocument()
  })
})

describe("ContentToolbar rendering", () => {
  it("renders the toolbar and handles clicking on automation button", () => {
    const onOpenAutomation = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ContentToolbar
            seed={{ slug: "posts", label: "Posts", branches: [] } as any}
            views={[
              {
                id: "table",
                label: "table",
                type: "table",
                enabledTools: ["automation"],
                conditionalFormats: [],
              },
            ]}
            activeViewId="table"
            onChangeView={vi.fn()}
            onCreate={vi.fn()}
            onOpenAutomation={onOpenAutomation}
          >
            <div>CHILD</div>
          </ContentToolbar>
        </TooltipProvider>
      </QueryClientProvider>
    )

    const btn = screen.getByRole("button", { name: /automation/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onOpenAutomation).toHaveBeenCalled()
  })
})
