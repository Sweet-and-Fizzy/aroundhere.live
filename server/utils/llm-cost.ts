import { MODELS } from '../services/llm/models'

// LLM pricing per token (Anthropic list prices, 2026-10)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': {
    input: 2.0 / 1_000_000,
    output: 10.0 / 1_000_000,
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  'claude-haiku-4-5-20251001': {
    input: 1.0 / 1_000_000,
    output: 5.0 / 1_000_000,
  },
}

// Unknown models are priced as Sonnet so cost alerts err high, not low
const DEFAULT_PRICING = PRICING['claude-sonnet-5-5']!

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model] || DEFAULT_PRICING
  return inputTokens * pricing.input + outputTokens * pricing.output
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

// Get the model we use for chat
export const CHAT_MODEL = MODELS.chat
