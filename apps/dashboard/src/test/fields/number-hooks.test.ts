import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useNumberStepper } from "@/components/fields/edit/use-number-stepper"
import { useNumberRating } from "@/components/fields/edit/use-number-rating"

describe("useNumberStepper", () => {
  it("rispetta il bound max nell'incremento", () => {
    const onChange = vi.fn()
    const { handleIncrement, canIncrement } = useNumberStepper({ max: 10 }, 10)
    
    expect(canIncrement).toBe(false)
    handleIncrement(onChange)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("rispetta il bound min nel decremento", () => {
    const onChange = vi.fn()
    const { handleDecrement, canDecrement } = useNumberStepper({ min: 0 }, 0)
    
    expect(canDecrement).toBe(false)
    handleDecrement(onChange)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("calcola correttamente i bound con step", () => {
    const { canIncrement, canDecrement } = useNumberStepper({ min: 0, max: 10, step: 2 }, 9)
    expect(canIncrement).toBe(false) // 9 + 2 = 11 > 10
    expect(canDecrement).toBe(true)  // 9 - 2 = 7 >= 0
  })

  it("parseInput gestisce stringa vuota come null", () => {
    const { parseInput } = useNumberStepper(undefined, 0)
    expect(parseInput("")).toBeNull()
    expect(parseInput("42")).toBe(42)
  })
})

describe("useNumberRating", () => {
  it("calcola correttamente lo stato delle stelle", () => {
    const { result } = renderHook(() => useNumberRating(undefined, 3))
    
    expect(result.current.getStarState(3).isFull).toBe(true)
    expect(result.current.getStarState(4).isFull).toBe(false)
  })

  it("supporta i mezzi voti solo se step <= 0.5", () => {
    const { result: r1 } = renderHook(() => useNumberRating({ step: 1 }, 2.5))
    expect(r1.current.allowHalf).toBe(false)

    const { result: r2 } = renderHook(() => useNumberRating({ step: 0.5 }, 2.5))
    expect(r2.current.allowHalf).toBe(true)
    expect(r2.current.getStarState(3).isHalf).toBe(true)
  })

  it("gestisce hover temporaneo", () => {
    const { result } = renderHook(() => useNumberRating(undefined, 2))
    
    expect(result.current.getStarState(3).isFull).toBe(false)
    
    act(() => {
      result.current.setHoverValue(4)
    })
    
    expect(result.current.getStarState(4).isFull).toBe(true)
  })
})
