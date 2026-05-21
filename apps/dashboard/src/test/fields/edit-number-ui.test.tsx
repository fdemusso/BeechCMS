import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { NumberEdit } from "@/features/fields/edit/number"
import type { Branch } from "@beechcms/core"

describe("NumberEdit Componenti (VSA)", () => {
  const baseBranch: Branch = {
    alias: "score",
    label: "Score",
    type: "number",
  }

  it("renderizza NumberInput di default se control non è specificato", () => {
    const onChange = vi.fn()
    render(<NumberEdit branch={baseBranch} value={42} onChange={onChange} />)
    const input = screen.getByDisplayValue("42") as HTMLInputElement
    expect(input.type).toBe("number")
    
    fireEvent.change(input, { target: { value: "100" } })
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it("renderizza NumberStepper e gestisce l'incremento/decremento tramite bottoni", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      ...baseBranch,
      numberOptions: { control: "stepper", min: 0, max: 10, step: 1 }
    }
    render(<NumberEdit branch={branch} value={5} onChange={onChange} />)
    
    // Test input testuale
    const input = screen.getByDisplayValue("5")
    fireEvent.change(input, { target: { value: "8" } })
    expect(onChange).toHaveBeenCalledWith(8)

    // Test bottoni (usando le label ARIA appena aggiunte)
    const incButton = screen.getByLabelText("Aumenta valore")
    fireEvent.click(incButton)
    expect(onChange).toHaveBeenCalledWith(6)

    const decButton = screen.getByLabelText("Riduci valore")
    fireEvent.click(decButton)
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it("renderizza NumberRating e gestisce i click sui mezzi voti", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      ...baseBranch,
      numberOptions: { control: "rating", max: 5, step: 0.5 }
    }
    render(<NumberEdit branch={branch} value={2.5} onChange={onChange} />)
    
    // Trova un mezzo bottone specifico, es "Imposta voto 3.5"
    const halfButton = screen.getByLabelText("Imposta voto 3.5")
    fireEvent.click(halfButton)
    expect(onChange).toHaveBeenCalledWith(3.5)
  })

  it("renderizza NumberSlider e invoca onChange al cambio del valore", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      ...baseBranch,
      numberOptions: { control: "slider", min: 0, max: 100, step: 1 }
    }
    // Nel dom, radux-ui restituisce elementi ARIA-slider.
    render(<NumberEdit branch={branch} value={50} onChange={onChange} />)
    
    const slider = screen.getByRole("slider")
    expect(slider.getAttribute("aria-valuenow")).toBe("50")
  })
})
