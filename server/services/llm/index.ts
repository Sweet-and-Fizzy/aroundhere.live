/**
 * Unified LLM Service
 * Provides a consistent interface for multiple AI providers
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  LLMProvider,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from './types'

import { acceptsSamplingParams } from './models'
import { createModelAlerter } from './model-alerts'
import { extractAnthropicText } from './anthropic-response'
import { sendSlackNotification } from '../notifications'

export * from './types'

export const reportModelFailure = createModelAlerter({ notify: sendSlackNotification })

class LLMService {
  private anthropicClient?: Anthropic
  private openaiClient?: OpenAI
  private googleClient?: GoogleGenerativeAI
  private deepseekClient?: OpenAI

  constructor() {
    // Initialize clients based on available API keys
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    }

    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      this.googleClient = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
    }

    if (process.env.DEEPSEEK_API_KEY) {
      this.deepseekClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      })
    }
  }

  /**
   * Generate completion from any LLM provider
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    switch (options.provider) {
      case 'anthropic':
        return this.completeAnthropic(options)
      case 'openai':
        return this.completeOpenAI(options)
      case 'google':
        return this.completeGoogle(options)
      case 'deepseek':
        return this.completeDeepSeek(options)
      default:
        throw new Error(`Unsupported provider: ${options.provider}`)
    }
  }

  /**
   * Anthropic (Claude) completion
   */
  private async completeAnthropic(
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic API key not configured')
    }

    // Separate system messages from user/assistant messages
    const systemMessages = options.messages.filter((m) => m.role === 'system')
    const conversationMessages = options.messages.filter((m) => m.role !== 'system')

    const systemPrompt =
      options.systemPrompt ||
      systemMessages.map((m) => m.content).join('\n\n') ||
      undefined

    let response: Anthropic.Message
    try {
      // Streaming avoids HTTP timeouts now that thinking tokens count toward max_tokens.
      response = await this.anthropicClient.messages
        .stream({
          model: options.model,
          max_tokens: options.maxTokens || 8192,
          ...(acceptsSamplingParams(options.model) ? { temperature: options.temperature ?? 0.7 } : {}),
          system: systemPrompt,
          messages: conversationMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        })
        .finalMessage()
    } catch (error) {
      await reportModelFailure(error, options.model, options.caller ?? 'llmService')
      throw error
    }

    if (response.stop_reason === 'refusal') {
      throw new Error(`Anthropic declined the request (model ${options.model})`)
    }
    if (response.stop_reason === 'max_tokens') {
      console.warn(`[LLM] ${options.model} hit max_tokens (${options.maxTokens || 8192}); output may be truncated`)
    }

    return {
      content: extractAnthropicText(response.content),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      provider: 'anthropic',
    }
  }

  /**
   * OpenAI completion
   */
  private async completeOpenAI(
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured')
    }

    const messages = options.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }))

    // Add system prompt if provided
    if (options.systemPrompt) {
      messages.unshift({
        role: 'system',
        content: options.systemPrompt,
      })
    }

    const response = await this.openaiClient.chat.completions.create({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 8192,
    })

    const choice = response.choices[0]
    if (!choice || !choice.message.content) {
      throw new Error('No content in OpenAI response')
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      model: response.model,
      provider: 'openai',
    }
  }

  /**
   * Google (Gemini) completion
   */
  private async completeGoogle(
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    if (!this.googleClient) {
      throw new Error('Google AI API key not configured')
    }

    const model = this.googleClient.getGenerativeModel({
      model: options.model,
    })

    // Combine system prompt with messages
    let prompt = ''
    if (options.systemPrompt) {
      prompt += options.systemPrompt + '\n\n'
    }

    // Convert messages to Gemini format
    for (const msg of options.messages) {
      if (msg.role === 'system') {
        prompt += msg.content + '\n\n'
      } else if (msg.role === 'user') {
        prompt += 'User: ' + msg.content + '\n\n'
      } else {
        prompt += 'Assistant: ' + msg.content + '\n\n'
      }
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 8192,
      },
    })

    const response = result.response
    const text = response.text()

    return {
      content: text,
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
      model: options.model,
      provider: 'google',
    }
  }

  /**
   * DeepSeek completion (uses OpenAI-compatible API)
   */
  private async completeDeepSeek(
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    if (!this.deepseekClient) {
      throw new Error('DeepSeek API key not configured')
    }

    const messages = options.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }))

    // Add system prompt if provided
    if (options.systemPrompt) {
      messages.unshift({
        role: 'system',
        content: options.systemPrompt,
      })
    }

    const response = await this.deepseekClient.chat.completions.create({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 8192,
    })

    const choice = response.choices[0]
    if (!choice || !choice.message.content) {
      throw new Error('No content in DeepSeek response')
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      model: response.model,
      provider: 'deepseek',
    }
  }

  /**
   * Check if a provider is configured
   */
  isProviderConfigured(provider: LLMProvider): boolean {
    switch (provider) {
      case 'anthropic':
        return !!this.anthropicClient
      case 'openai':
        return !!this.openaiClient
      case 'google':
        return !!this.googleClient
      case 'deepseek':
        return !!this.deepseekClient
      default:
        return false
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = []
    if (this.anthropicClient) providers.push('anthropic')
    if (this.openaiClient) providers.push('openai')
    if (this.googleClient) providers.push('google')
    if (this.deepseekClient) providers.push('deepseek')
    return providers
  }
}

// Singleton instance
const globalForLLM = globalThis as unknown as {
  llmService: LLMService | undefined
}

export const llmService =
  globalForLLM.llmService ?? new LLMService()

if (process.env.NODE_ENV !== 'production') {
  globalForLLM.llmService = llmService
}

export default llmService
