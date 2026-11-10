// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export interface EvaluatedExpression {
  readonly value: number
  /** true when at least one binary operator was applied (`2+3`), false for a lone operand (`-5`, `(7)`). */
  readonly compound: boolean
}

const MAX_EXPRESSION_LENGTH = 200
const MAX_EXPRESSION_DEPTH = 32

type Token =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "operator"; readonly symbol: "+" | "-" | "*" | "/" | "^" }
  | { readonly kind: "paren"; readonly symbol: "(" | ")" }

const NUMBER_AT_CURSOR = /\d+(?:\.\d+)?|\.\d+/y
const OPERATORS = new Set(["+", "-", "*", "/", "^"])

class ExpressionSyntaxError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0

  while (cursor < input.length) {
    const char = input[cursor]
    if (/\s/.test(char)) {
      cursor++
      continue
    }

    NUMBER_AT_CURSOR.lastIndex = cursor
    const numberMatch = NUMBER_AT_CURSOR.exec(input)
    if (numberMatch) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]) })
      cursor += numberMatch[0].length
    } else if (OPERATORS.has(char)) {
      tokens.push({ kind: "operator", symbol: char as "+" | "-" | "*" | "/" | "^" })
      cursor++
    } else if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", symbol: char })
      cursor++
    } else {
      throw new ExpressionSyntaxError()
    }
  }

  return tokens
}

/** Recursive descent over `expr → term → unary → power → atom`; `compound` records any binary operator applied. */
class Parser {
  private position = 0
  private depth = 0
  compound = false

  private readonly tokens: readonly Token[]

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens
  }

  parse(): number {
    const value = this.parseExpression()
    if (this.position < this.tokens.length) throw new ExpressionSyntaxError()
    return value
  }

  private peekOperator(...symbols: string[]): string | null {
    const token = this.tokens[this.position]
    return token?.kind === "operator" && symbols.includes(token.symbol) ? token.symbol : null
  }

  private parseExpression(): number {
    let left = this.parseTerm()
    for (let symbol = this.peekOperator("+", "-"); symbol; symbol = this.peekOperator("+", "-")) {
      this.position++
      const right = this.parseTerm()
      this.compound = true
      left = symbol === "+" ? left + right : left - right
    }
    return left
  }

  private parseTerm(): number {
    let left = this.parseUnary()
    for (let symbol = this.peekOperator("*", "/"); symbol; symbol = this.peekOperator("*", "/")) {
      this.position++
      const right = this.parseUnary()
      this.compound = true
      left = symbol === "*" ? left * right : left / right
    }
    return left
  }

  private parseUnary(): number {
    const sign = this.peekOperator("+", "-")
    if (!sign) return this.parsePower()
    this.position++
    const operand = this.parseUnary()
    return sign === "-" ? -operand : operand
  }

  private parsePower(): number {
    const base = this.parseAtom()
    if (!this.peekOperator("^")) return base
    this.position++
    const exponent = this.parseUnary()
    this.compound = true
    return base ** exponent
  }

  private parseAtom(): number {
    const token = this.tokens[this.position]
    if (token?.kind === "number") {
      this.position++
      return token.value
    }
    if (token?.kind === "paren" && token.symbol === "(") {
      this.position++
      if (++this.depth > MAX_EXPRESSION_DEPTH) throw new ExpressionSyntaxError()
      const value = this.parseExpression()
      const closing = this.tokens[this.position]
      if (closing?.kind !== "paren" || closing.symbol !== ")") throw new ExpressionSyntaxError()
      this.position++
      this.depth--
      return value
    }
    throw new ExpressionSyntaxError()
  }
}

/** Evaluates `+ - * / ^` and parentheses over decimal numbers. null when the input is not a complete, finite expression. Never throws. */
export function evaluateExpression(input: string): EvaluatedExpression | null {
  if (input.length > MAX_EXPRESSION_LENGTH) return null

  try {
    const parser = new Parser(tokenize(input))
    const value = parser.parse()
    return Number.isFinite(value) ? { value, compound: parser.compound } : null
  } catch {
    return null
  }
}
