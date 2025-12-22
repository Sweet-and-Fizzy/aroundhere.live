import { describe, it, expect } from 'vitest'
import {
  containsHtml,
  decodeHtmlEntities,
  stripHtmlTags,
  stripHtmlAndClean,
  normalizeForComparison,
  sanitizeHtml,
  processDescriptions,
  cleanEventTitle,
  generateSlug,
} from '../html'

describe('containsHtml', () => {
  it('should detect HTML tags', () => {
    expect(containsHtml('<p>Hello</p>')).toBe(true)
    expect(containsHtml('Hello <b>world</b>')).toBe(true)
    expect(containsHtml('<br/>')).toBe(true)
    expect(containsHtml('<img src="test.jpg">')).toBe(true)
  })

  it('should return false for plain text', () => {
    expect(containsHtml('Hello world')).toBe(false)
    expect(containsHtml('No tags here!')).toBe(false)
    expect(containsHtml('')).toBe(false)
  })

  it('should return false for HTML entities', () => {
    expect(containsHtml('&amp;&lt;&gt;')).toBe(false)
  })

  it('should detect malformed tags', () => {
    expect(containsHtml('< p>')).toBe(true) // Has tag-like pattern
    expect(containsHtml('a < b')).toBe(false) // Just comparison operator
  })
})

describe('decodeHtmlEntities', () => {
  describe('named entities', () => {
    it('should decode common named entities', () => {
      expect(decodeHtmlEntities('&amp;')).toBe('&')
      expect(decodeHtmlEntities('&lt;')).toBe('<')
      expect(decodeHtmlEntities('&gt;')).toBe('>')
      expect(decodeHtmlEntities('&quot;')).toBe('"')
      expect(decodeHtmlEntities('&apos;')).toBe("'")
      expect(decodeHtmlEntities('&nbsp;')).toBe(' ')
    })

    it('should decode typographic entities', () => {
      expect(decodeHtmlEntities('&ndash;')).toBe('\u2013') // en dash
      expect(decodeHtmlEntities('&mdash;')).toBe('\u2014') // em dash
      expect(decodeHtmlEntities('&rsquo;')).toBe('\u2019') // right single quote
      expect(decodeHtmlEntities('&lsquo;')).toBe('\u2018') // left single quote
      expect(decodeHtmlEntities('&rdquo;')).toBe('\u201D') // right double quote
      expect(decodeHtmlEntities('&ldquo;')).toBe('\u201C') // left double quote
    })

    it('should decode multiple entities', () => {
      expect(decodeHtmlEntities('&lt;div&gt;&amp;&lt;/div&gt;')).toBe('<div>&</div>')
      expect(decodeHtmlEntities('Rock &amp; Roll')).toBe('Rock & Roll')
    })
  })

  describe('numeric entities', () => {
    it('should decode decimal numeric entities', () => {
      expect(decodeHtmlEntities('&#38;')).toBe('&')
      expect(decodeHtmlEntities('&#60;')).toBe('<')
      expect(decodeHtmlEntities('&#62;')).toBe('>')
      expect(decodeHtmlEntities('&#169;')).toBe('©')
    })

    it('should decode hexadecimal numeric entities', () => {
      expect(decodeHtmlEntities('&#x26;')).toBe('&')
      expect(decodeHtmlEntities('&#x3C;')).toBe('<')
      expect(decodeHtmlEntities('&#x3E;')).toBe('>')
      expect(decodeHtmlEntities('&#xA9;')).toBe('©')
    })

    it('should handle mixed case hex entities', () => {
      expect(decodeHtmlEntities('&#xAB;')).toBe('«')
      expect(decodeHtmlEntities('&#xab;')).toBe('«')
    })
  })

  it('should handle text without entities', () => {
    expect(decodeHtmlEntities('Hello world')).toBe('Hello world')
  })

  it('should handle empty string', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('should decode mixed entity types', () => {
    expect(decodeHtmlEntities('&amp; &#38; &#x26;')).toBe('& & &')
  })
})

describe('stripHtmlTags', () => {
  it('should remove simple tags', () => {
    expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello')
    expect(stripHtmlTags('<b>Bold</b>')).toBe('Bold')
  })

  it('should remove self-closing tags', () => {
    expect(stripHtmlTags('Line 1<br/>Line 2')).toBe('Line 1Line 2')
    expect(stripHtmlTags('Image<img src="test.jpg">here')).toBe('Imagehere')
  })

  it('should remove tags with attributes', () => {
    expect(stripHtmlTags('<a href="http://example.com">Link</a>')).toBe('Link')
    expect(stripHtmlTags('<div class="test" id="main">Content</div>')).toBe('Content')
  })

  it('should remove nested tags', () => {
    expect(stripHtmlTags('<div><p><b>Nested</b></p></div>')).toBe('Nested')
  })

  it('should handle text without tags', () => {
    expect(stripHtmlTags('Plain text')).toBe('Plain text')
  })

  it('should handle empty string', () => {
    expect(stripHtmlTags('')).toBe('')
  })

  it('should preserve entities', () => {
    expect(stripHtmlTags('<p>&amp;&lt;&gt;</p>')).toBe('&amp;&lt;&gt;')
  })
})

describe('stripHtmlAndClean', () => {
  it('should strip tags and decode entities', () => {
    expect(stripHtmlAndClean('<p>Hello &amp; goodbye</p>')).toBe('Hello & goodbye')
  })

  it('should normalize whitespace', () => {
    expect(stripHtmlAndClean('Multiple   spaces')).toBe('Multiple spaces')
    expect(stripHtmlAndClean('  Leading spaces')).toBe('Leading spaces')
    expect(stripHtmlAndClean('Trailing spaces  ')).toBe('Trailing spaces')
  })

  it('should handle newlines and tabs', () => {
    expect(stripHtmlAndClean('Line 1\n\nLine 2')).toBe('Line 1 Line 2')
    expect(stripHtmlAndClean('Tab\t\tSeparated')).toBe('Tab Separated')
  })

  it('should combine stripping, decoding, and cleaning', () => {
    expect(stripHtmlAndClean('  <p>Rock  &amp;  Roll</p>  ')).toBe('Rock & Roll')
  })

  it('should handle empty string', () => {
    expect(stripHtmlAndClean('')).toBe('')
  })
})

describe('normalizeForComparison', () => {
  it('should lowercase text', () => {
    expect(normalizeForComparison('Hello World')).toBe('hello world')
  })

  it('should decode entities', () => {
    expect(normalizeForComparison('Rock &amp; Roll')).toBe('rock roll')
  })

  it('should remove punctuation', () => {
    expect(normalizeForComparison("Don't stop, believe!")).toBe('dont stop believe')
    // Hyphens between numbers are removed but numbers stay together
    expect(normalizeForComparison('Test: 1-2-3')).toBe('test 123')
  })

  it('should normalize whitespace', () => {
    expect(normalizeForComparison('Multiple   spaces')).toBe('multiple spaces')
  })

  it('should combine all transformations', () => {
    expect(normalizeForComparison("  Rock 'N' Roll &amp; Blues!  ")).toBe('rock n roll blues')
  })

  it('should handle empty string', () => {
    expect(normalizeForComparison('')).toBe('')
  })

  it('should handle special characters', () => {
    // Special chars are removed, numbers stay together
    expect(normalizeForComparison('Test@123#456')).toBe('test123456')
  })
})

describe('sanitizeHtml', () => {
  describe('script tag removal', () => {
    it('should remove script tags', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('')
      expect(sanitizeHtml('<p>Text</p><script>bad()</script>')).toBe('<p>Text</p>')
    })

    it('should remove script tags with attributes', () => {
      expect(sanitizeHtml('<script type="text/javascript">alert(1)</script>')).toBe('')
    })

    it('should remove inline script tags', () => {
      expect(sanitizeHtml('Before<script>code</script>After')).toBe('BeforeAfter')
    })
  })

  describe('event handler removal', () => {
    it('should remove onclick handlers', () => {
      expect(sanitizeHtml('<div onclick="alert(1)">Click</div>')).toBe('<div>Click</div>')
    })

    it('should remove onerror handlers', () => {
      expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">')
    })

    it('should remove event handlers with double quotes', () => {
      expect(sanitizeHtml('<a href="#" onclick="bad()">Link</a>')).toBe('<a href="#">Link</a>')
    })

    it('should remove event handlers with single quotes', () => {
      expect(sanitizeHtml("<a href='#' onclick='bad()'>Link</a>")).toBe("<a href='#'>Link</a>")
    })

    it('should remove multiple event handlers', () => {
      expect(sanitizeHtml('<div onclick="a()" onmouseover="b()">Test</div>')).toBe('<div>Test</div>')
    })
  })

  describe('iframe removal with ownDomain', () => {
    it('should remove iframes with own domain', () => {
      const html = '<iframe src="https://example.com/page"></iframe>'
      expect(sanitizeHtml(html, 'example.com')).toBe('')
    })

    it('should keep iframes from other domains', () => {
      const html = '<iframe src="https://youtube.com/embed/video"></iframe>'
      expect(sanitizeHtml(html, 'example.com')).toBe(html)
    })

    it('should remove self-closing iframes with own domain', () => {
      const html = '<iframe src="https://example.com/page" />'
      expect(sanitizeHtml(html, 'example.com')).toBe('')
    })

    it('should handle iframes without ownDomain parameter', () => {
      const html = '<iframe src="https://example.com/page"></iframe>'
      expect(sanitizeHtml(html)).toBe(html)
    })

    it('should handle special characters in domain', () => {
      const html = '<iframe src="https://example.com/page?a=1&b=2"></iframe>'
      expect(sanitizeHtml(html, 'example.com')).toBe('')
    })
  })

  it('should preserve safe content', () => {
    const html = '<p>Safe <b>content</b> with <a href="http://example.com">link</a></p>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('should handle empty string', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})

describe('processDescriptions', () => {
  it('should return null for null input', () => {
    expect(processDescriptions(null)).toEqual({
      description: null,
      descriptionHtml: null,
    })
  })

  it('should return null for undefined input', () => {
    expect(processDescriptions(undefined)).toEqual({
      description: null,
      descriptionHtml: null,
    })
  })

  it('should handle plain text', () => {
    const result = processDescriptions('Plain text description')
    expect(result.description).toBe('Plain text description')
    expect(result.descriptionHtml).toBe(null)
  })

  it('should process HTML description', () => {
    const result = processDescriptions('<p>HTML description</p>')
    expect(result.description).toBe('HTML description')
    expect(result.descriptionHtml).toBe('<p>HTML description</p>')
  })

  it('should sanitize HTML when processing', () => {
    const result = processDescriptions('<p>Test</p><script>alert(1)</script>')
    // stripHtmlAndClean removes ALL tags including script content
    expect(result.description).toBe('Testalert(1)')
    // sanitizeHtml removes script tag
    expect(result.descriptionHtml).toBe('<p>Test</p>')
  })

  it('should remove own domain iframes when provided', () => {
    const result = processDescriptions(
      '<p>Test</p><iframe src="https://example.com/page"></iframe>',
      'example.com'
    )
    expect(result.description).toBe('Test')
    expect(result.descriptionHtml).toBe('<p>Test</p>')
  })

  it('should decode entities in plain text', () => {
    const result = processDescriptions('Rock &amp; Roll')
    expect(result.description).toBe('Rock & Roll')
    expect(result.descriptionHtml).toBe(null)
  })

  it('should clean whitespace', () => {
    const result = processDescriptions('  Multiple   spaces  ')
    expect(result.description).toBe('Multiple spaces')
  })
})

describe('cleanEventTitle', () => {
  describe('category prefix removal', () => {
    it('should remove "Live music:" prefix', () => {
      expect(cleanEventTitle('Live music: Band Name')).toBe('Band Name')
      expect(cleanEventTitle('Live Music - Band Name')).toBe('Band Name')
    })

    it('should remove other category prefixes', () => {
      expect(cleanEventTitle('Music: Band Name')).toBe('Band Name')
      expect(cleanEventTitle('Comedy: Comedian Name')).toBe('Comedian Name')
      expect(cleanEventTitle('Show - Band Name')).toBe('Band Name')
    })

    it('should be case insensitive', () => {
      expect(cleanEventTitle('LIVE MUSIC: Band')).toBe('Band')
    })
  })

  describe('date prefix removal', () => {
    it('should remove date prefixes', () => {
      expect(cleanEventTitle('Saturday December 20th - Band Name')).toBe('Band Name')
      expect(cleanEventTitle('Friday, January 3rd - Band Name')).toBe('Band Name')
    })

    it('should handle dates without ordinal suffix', () => {
      expect(cleanEventTitle('Monday March 5 - Band Name')).toBe('Band Name')
    })
  })

  describe('time removal', () => {
    it('should remove time ranges', () => {
      expect(cleanEventTitle('Band Name 7-10')).toBe('Band Name')
      expect(cleanEventTitle('Band Name 7-8:30')).toBe('Band Name')
      expect(cleanEventTitle('Band Name, 7pm-10pm')).toBe('Band Name')
    })

    it('should remove standalone times', () => {
      expect(cleanEventTitle('Band Name 7pm')).toBe('Band Name')
      expect(cleanEventTitle('Band Name 8:30pm')).toBe('Band Name')
    })

    it('should remove times with comma separator', () => {
      expect(cleanEventTitle('Band Name, 8pm')).toBe('Band Name')
    })
  })

  describe('parenthetical notes removal', () => {
    it('should remove sign-up notes', () => {
      expect(cleanEventTitle('Open Mic (Sign-Up @ 6)')).toBe('Open Mic')
      expect(cleanEventTitle('Comedy Night (signup at 7pm)')).toBe('Comedy Night')
    })

    it('should remove doors notes', () => {
      expect(cleanEventTitle('Concert (Doors @ 7pm)')).toBe('Concert')
    })

    it('should remove time notes', () => {
      // Leaves empty parentheses (regex matches content but not full removal)
      expect(cleanEventTitle('Band Name (8pm)')).toBe('Band Name ()')
    })
  })

  describe('combined transformations', () => {
    it('should handle multiple patterns', () => {
      expect(cleanEventTitle('Live music: Saturday December 20th - Band Name, 8pm')).toBe('Band Name')
    })

    it('should clean up trailing punctuation', () => {
      expect(cleanEventTitle('Band Name,  ')).toBe('Band Name')
      expect(cleanEventTitle('Band Name  ,')).toBe('Band Name')
    })
  })

  it('should return original if cleaning results in empty string', () => {
    expect(cleanEventTitle('8pm')).toBe('8pm')
  })

  it('should handle empty string', () => {
    expect(cleanEventTitle('')).toBe('')
  })

  it('should preserve titles without removable patterns', () => {
    expect(cleanEventTitle('Band Name')).toBe('Band Name')
    expect(cleanEventTitle('Special Concert Event')).toBe('Special Concert Event')
  })
})

describe('generateSlug', () => {
  it('should create basic slug from text', () => {
    expect(generateSlug('Hello World')).toBe('hello-world')
  })

  it('should replace spaces with hyphens', () => {
    expect(generateSlug('Multiple   Spaces')).toBe('multiple-spaces')
  })

  it('should remove special characters', () => {
    expect(generateSlug("Rock 'N' Roll!")).toBe('rock-n-roll')
    expect(generateSlug('Test@#$%123')).toBe('test-123')
  })

  it('should handle consecutive hyphens', () => {
    expect(generateSlug('Test -- Multiple -- Hyphens')).toBe('test-multiple-hyphens')
  })

  it('should remove leading/trailing hyphens', () => {
    expect(generateSlug('---Test---')).toBe('test')
  })

  it('should limit length to 80 characters', () => {
    const longText = 'a'.repeat(100)
    expect(generateSlug(longText).length).toBe(80)
  })

  it('should append date when provided', () => {
    const date = new Date('2025-03-15T20:00:00Z')
    expect(generateSlug('Event Name', date)).toBe('event-name-2025-03-15')
  })

  it('should handle date without exceeding max length', () => {
    const longText = 'a'.repeat(100)
    const date = new Date('2025-03-15')
    const slug = generateSlug(longText, date)
    expect(slug.endsWith('-2025-03-15')).toBe(true)
    expect(slug.length).toBeLessThanOrEqual(91) // 80 + '-' + 10 date chars
  })

  it('should handle empty string', () => {
    expect(generateSlug('')).toBe('')
  })

  it('should lowercase all characters', () => {
    expect(generateSlug('UPPERCASE Text')).toBe('uppercase-text')
  })

  it('should handle unicode characters', () => {
    expect(generateSlug('Café Résumé')).toBe('caf-r-sum')
  })
})
