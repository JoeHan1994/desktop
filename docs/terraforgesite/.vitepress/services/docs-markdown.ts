import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: false,
  typographer: false,
})

const allowedTags = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'code', 'pre', 'blockquote', 'hr']

export function renderDocsAnswer(content: string) {
  if (typeof window === 'undefined') return ''

  return DOMPurify.sanitize(markdown.render(content), {
    ALLOWED_ATTR: [],
    ALLOWED_TAGS: allowedTags,
  })
}
