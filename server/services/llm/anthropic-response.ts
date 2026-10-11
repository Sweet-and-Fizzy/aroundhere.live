type TextBlock = { type: 'text'; text: string }

function isTextBlock(block: { type: string }): block is TextBlock {
  return block.type === 'text' && typeof (block as { text?: unknown }).text === 'string'
}

/**
 * Text of a Messages API response. Newer models return thinking blocks ahead
 * of the text, so the text is not necessarily content[0].
 */
export function extractAnthropicText(content: ReadonlyArray<{ type: string }>): string {
  const text = content.filter(isTextBlock).map(b => b.text).join('')
  if (!text) throw new Error('No text content in Anthropic response')
  return text
}
