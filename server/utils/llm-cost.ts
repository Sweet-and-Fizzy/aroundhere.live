// LLM pricing per token (as of Dec 2024)
// Prices are per token, not per 1K tokens

const PRICING: Record<string, { input: number; output: number }> = {
  // Claude 3.5 Sonnet
  'claude-sonnet-4-20250514': {
    input: 3.0 / 1_000_000, // $3 per 1M input tokens
    output: 15.0 / 1_000_000, // $15 per 1M output tokens
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  // Claude 3.5 Haiku (cheaper option)
  'claude-3-5-haiku-20241022': {
    input: 0.8 / 1_000_000, // $0.80 per 1M input tokens
    output: 4.0 / 1_000_000, // $4 per 1M output tokens
  },
  // Claude 3 Haiku (cheapest)
  'claude-3-haiku-20240307': {
    input: 0.25 / 1_000_000,
    output: 1.25 / 1_000_000,
  },
}

// Default to Sonnet pricing if model not found
const DEFAULT_PRICING = PRICING['claude-sonnet-4-20250514']!

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
export const CHAT_MODEL = 'claude-sonnet-4-20250514'
