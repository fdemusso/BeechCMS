import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BooleanEdit } from "@/features/fields/edit/boolean"
import { NumberEdit } from "@/features/fields/edit/number"
import { TextEdit } from "@/features/fields/edit/text"
import { DefaultDisplay, DefaultEdit } from "@/features/fields/default"
import { FieldEdit } from "@/features/fields/FieldEdit"
import type { Branch } from "@beechcms/core"

const branch = {
  id: "br_01",
  alias: "field",
  label: "My Field",
  type: "text",
  policies: [],
} as unknown as Branch

describe("BooleanEdit", () => {
  it("checked quando value è true", () => {
    const onChange = vi.fn()
    render(<BooleanEdit branch={branch} value={true} onChange={onChange} />)
    const checkbox = screen.getByRole("checkbox")
    expect(checkbox).toBeChecked()
  })

  it("checked quando value è 'true'", () => {
    const onChange = vi.fn()
    render(<BooleanEdit branch={branch} value="true" onChange={onChange} />)
    expect(screen.getByRole("checkbox")).toBeChecked()
  })

  it("non checked quando value è false", () => {
    const onChange = vi.fn()
    render(<BooleanEdit branch={branch} value={false} onChange={onChange} />)
    expect(screen.getByRole("checkbox")).not.toBeChecked()
  })

  it("mostra label del branch", () => {
    render(<BooleanEdit branch={branch} value={false} onChange={vi.fn()} />)
    expect(screen.getByText("My Field")).toBeInTheDocument()
  })
})

describe("NumberEdit", () => {
  it("renderizza input type number", () => {
    render(<NumberEdit branch={branch} value={42} onChange={vi.fn()} />)
    const input = screen.getByRole("spinbutton")
    expect(input).toHaveValue(42)
  })

  it("value undefined mostra campo vuoto", () => {
    render(<NumberEdit branch={branch} value={undefined} onChange={vi.fn()} />)
    const input = screen.getByRole("spinbutton")
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("onChange chiamato con numero", () => {
    const onChange = vi.fn()
    render(<NumberEdit branch={branch} value={0} onChange={onChange} />)
    const input = screen.getByRole("spinbutton")
    fireEvent.change(input, { target: { value: "99" } })
    expect(onChange).toHaveBeenCalledWith(99)
  })

  it("onChange chiamato con null quando campo svuotato", () => {
    const onChange = vi.fn()
    render(<NumberEdit branch={branch} value={5} onChange={onChange} />)
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } })
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe("TextEdit", () => {
  it("renderizza input type text con valore", () => {
    render(<TextEdit branch={branch} value="hello" onChange={vi.fn()} />)
    expect(screen.getByRole("textbox")).toHaveValue("hello")
  })

  it("value null mostra campo vuoto", () => {
    render(<TextEdit branch={branch} value={null} onChange={vi.fn()} />)
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("")
  })

  it("onChange chiamato con il testo digitato", () => {
    const onChange = vi.fn()
    render(<TextEdit branch={branch} value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "test" } })
    expect(onChange).toHaveBeenCalledWith("test")
  })
})

describe("DefaultDisplay", () => {
  it("value null mostra '-'", () => {
    render(<DefaultDisplay branch={branch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("stringa vuota mostra '-'", () => {
    render(<DefaultDisplay branch={branch} value="" />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("value non-null mostra il valore", () => {
    render(<DefaultDisplay branch={branch} value="test-value" />)
    expect(screen.getByText("test-value")).toBeInTheDocument()
  })

  it("numero mostra la stringa del numero", () => {
    render(<DefaultDisplay branch={branch} value={42} />)
    expect(screen.getByText("42")).toBeInTheDocument()
  })
})

describe("DefaultEdit", () => {
  it("renderizza input text con valore", () => {
    render(<DefaultEdit branch={branch} value="hello" onChange={vi.fn()} />)
    expect(screen.getByRole("textbox")).toHaveValue("hello")
  })

  it("value null mostra campo vuoto", () => {
    render(<DefaultEdit branch={branch} value={null} onChange={vi.fn()} />)
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("")
  })

  it("onChange chiamato con il testo", () => {
    const onChange = vi.fn()
    render(<DefaultEdit branch={branch} value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } })
    expect(onChange).toHaveBeenCalledWith("x")
  })
})

describe("FieldEdit", () => {
  it("campo sensibile (hash) mostra placeholder oscurato", () => {
    const hashBranch = {
      ...branch,
      type: "text",
      policies: { privacy: "hash" },
    } as unknown as Branch
    render(<FieldEdit branch={hashBranch} value="" onChange={vi.fn()} />)
    expect(screen.getByText("••••••••")).toBeInTheDocument()
  })

  it("campo normale renderizza il componente edit", () => {
    render(<FieldEdit branch={branch} value="hello" onChange={vi.fn()} />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })
})
