interface ValidationResult {
  valid: boolean
  error?: string
  sanitized?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_MESSAGE_LENGTH = 2000
const MAX_CONVERSATION_LENGTH = 50 // Total messages in conversation

// Common prompt injection patterns
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now/i,
  /new\s+instructions?:/i,
  /system\s*:/i,
  /\[SYSTEM\]/i,
  /forget\s+(everything|all|previous)/i,
  /your\s+new\s+(role|purpose|task)\s+is/i,
  /act\s+as\s+(if\s+you\s+are\s+)?(a\s+)?(?!.*music|.*event|.*concert)/i, // Allow "act as a music expert"
  /pretend\s+(you\s+are|to\s+be)/i,
  /roleplay/i,
  /simulation\s+mode/i,
  /developer\s+mode/i,
  /admin\s+mode/i,
  /sudo\s+mode/i,
  /override/i,
  /<\/system>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
]

// Patterns that might indicate attempts to extract system information
const SYSTEM_PROBING_PATTERNS = [
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /show\s+me\s+your\s+(prompt|instructions?|rules|system)/i,
  /repeat\s+your\s+(instructions?|prompt|rules)/i,
  /what\s+are\s+you\s+programmed\s+to/i,
  /reveal\s+your/i,
  /print\s+your\s+(system|instructions?|prompt)/i,
]

/**
 * Validates a single message for length and injection attempts
 */
export function validateMessage(message: string): ValidationResult {
  // Check length
  if (message.length === 0) {
    return {
      valid: false,
      error: 'Message cannot be empty',
    }
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
    }
  }

  // Check for prompt injection patterns
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        valid: false,
        error: 'Message contains prohibited content',
      }
    }
  }

  // Check for system probing (warn but don't block - let system prompt handle it)
  let sanitized = message
  for (const pattern of SYSTEM_PROBING_PATTERNS) {
    if (pattern.test(message)) {
      // Instead of blocking, we'll flag it and let the system prompt handle it gracefully
      console.warn('System probing attempt detected:', message.substring(0, 100))
      break
    }
  }

  // Remove any potential control characters or weird Unicode
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')

  return {
    valid: true,
    sanitized,
  }
}

/**
 * Validates the entire conversation
 */
export function validateConversation(messages: ChatMessage[]): ValidationResult {
  if (!Array.isArray(messages)) {
    return {
      valid: false,
      error: 'Messages must be an array',
    }
  }

  if (messages.length === 0) {
    return {
      valid: false,
      error: 'At least one message is required',
    }
  }

  if (messages.length > MAX_CONVERSATION_LENGTH) {
    return {
      valid: false,
      error: `Conversation too long (max ${MAX_CONVERSATION_LENGTH} messages)`,
    }
  }

  // Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Check if message exists
    if (!msg) {
      return {
        valid: false,
        error: `Message ${i} is undefined`,
      }
    }

    if (!msg.role || !msg.content) {
      return {
        valid: false,
        error: `Message ${i} missing role or content`,
      }
    }

    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return {
        valid: false,
        error: `Message ${i} has invalid role: ${msg.role}`,
      }
    }

    // Only validate user messages for injection (assistant messages are from us)
    if (msg.role === 'user') {
      const validation = validateMessage(msg.content)
      if (!validation.valid) {
        return {
          valid: false,
          error: `Message ${i}: ${validation.error}`,
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Sanitizes messages by removing control characters
 */
export function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => ({
    ...msg,
    content: msg.role === 'user'
      ? (validateMessage(msg.content).sanitized || msg.content)
      : msg.content,
  }))
}
