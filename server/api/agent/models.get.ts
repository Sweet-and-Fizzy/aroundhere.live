/**
 * Get available LLM models
 * GET /api/agent/models
 */

import { llmService } from '../../services/llm'
import { ALL_MODELS } from '../../services/llm/types'

export default defineEventHandler(async () => {
  // Get available providers
  const availableProviders = llmService.getAvailableProviders()

  // Build response with models for each available provider
  const providerModels = availableProviders.map((provider) => ({
    provider,
    models: ALL_MODELS[provider],
    isConfigured: llmService.isProviderConfigured(provider),
  }))

  return {
    providers: providerModels,
    defaultProvider: availableProviders.includes('anthropic') ? 'anthropic' : availableProviders[0],
    defaultModel: availableProviders.includes('anthropic') ? 'claude-sonnet-4-20250514' : undefined,
  }
})
