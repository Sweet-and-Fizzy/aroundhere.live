/**
 * Unified LLM Service Types
 * Supports multiple AI providers: Anthropic, OpenAI, Google, DeepSeek
 */

export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'deepseek'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCompletionOptions {
  provider: LLMProvider
  model: string
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface LLMCompletionResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
  provider: LLMProvider
}

export interface LLMProviderConfig {
  provider: LLMProvider
  apiKey: string
  baseURL?: string
  models: LLMModelInfo[]
  defaultModel?: string
}

export interface LLMModelInfo {
  id: string
  name: string
  description?: string
  contextWindow?: number
  maxOutputTokens?: number
  costPer1kInputTokens?: number
  costPer1kOutputTokens?: number
}

// Available models by provider
export const ANTHROPIC_MODELS: LLMModelInfo[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Most capable model for complex reasoning and code generation',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Balanced quality and speed for most tasks',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fast and cost-effective for simpler tasks',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1kInputTokens: 0.001,
    costPer1kOutputTokens: 0.005,
  },
]

export const OPENAI_MODELS: LLMModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Latest multimodal model with strong reasoning',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPer1kInputTokens: 0.0025,
    costPer1kOutputTokens: 0.01,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'Fast GPT-4 variant with good performance',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPer1kInputTokens: 0.01,
    costPer1kOutputTokens: 0.03,
  },
  {
    id: 'o1-preview',
    name: 'OpenAI o1 Preview',
    description: 'Advanced reasoning model for complex problems',
    contextWindow: 128000,
    maxOutputTokens: 32768,
    costPer1kInputTokens: 0.015,
    costPer1kOutputTokens: 0.06,
  },
]

export const GOOGLE_MODELS: LLMModelInfo[] = [
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    description: 'Fast multimodal model with excellent coding capabilities',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPer1kInputTokens: 0.00001,
    costPer1kOutputTokens: 0.00003,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'High-capability model with large context',
    contextWindow: 2000000,
    maxOutputTokens: 8192,
    costPer1kInputTokens: 0.00125,
    costPer1kOutputTokens: 0.005,
  },
]

export const DEEPSEEK_MODELS: LLMModelInfo[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    description: 'Excellent coding model, very cost effective',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPer1kInputTokens: 0.00014,
    costPer1kOutputTokens: 0.00028,
  },
]

export const ALL_MODELS: Record<LLMProvider, LLMModelInfo[]> = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
  google: GOOGLE_MODELS,
  deepseek: DEEPSEEK_MODELS,
}
