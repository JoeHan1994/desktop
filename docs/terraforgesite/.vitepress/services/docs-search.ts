import MiniSearch from 'minisearch'

export interface DocsPageSource {
  title?: string
  path: string
  content: string
}

export interface DocsChunk {
  id: string
  title: string
  path: string
  heading: string
  content: string
}

export interface DocsContext {
  title: string
  path: string
  heading?: string
  content: string
}

export interface DocsSource {
  title: string
  path: string
}

const MaxChunkCharacters = 7000
const DefaultMaxContexts = 8
const DefaultMaxContextsPerPage = 2
const DefaultMaxContextCharacters = 48000

export function buildDocsCorpus(pages: DocsPageSource[]): DocsChunk[] {
  return pages.flatMap((page) => chunkPage(page))
}

export function normalizeDocsPath(path: string, base = '/') {
  const pathname = path.split(/[?#]/, 1)[0] || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const pathWithoutBase =
    normalizedBase !== '/' && pathname.startsWith(normalizedBase)
      ? `/${pathname.slice(normalizedBase.length)}`
      : pathname

  return pathWithoutBase.replace(/(?:index)?\.html$/, '') || '/'
}

export function createDocsSearch(chunks: DocsChunk[]) {
  const search = new MiniSearch<DocsChunk>({
    fields: ['title', 'heading', 'path', 'content'],
    storeFields: ['id', 'title', 'path', 'heading', 'content'],
    searchOptions: {
      boost: { title: 5, heading: 4, path: 2, content: 1 },
      combineWith: 'OR',
      fuzzy: 0.2,
      prefix: true,
    },
  })

  search.addAll(chunks)
  return search
}

export function retrieveDocsContexts(
  search: MiniSearch<DocsChunk>,
  chunks: DocsChunk[],
  question: string,
  currentPath: string,
  recentUserQuestions: string[] = [],
  options: {
    maxContexts?: number
    maxContextsPerPage?: number
    maxCharacters?: number
    base?: string
  } = {},
): DocsContext[] {
  const maxContexts = options.maxContexts ?? DefaultMaxContexts
  const maxContextsPerPage = options.maxContextsPerPage ?? DefaultMaxContextsPerPage
  const maxCharacters = options.maxCharacters ?? DefaultMaxContextCharacters
  const normalizedCurrentPath = normalizeDocsPath(currentPath, options.base)
  const query = [question, ...recentUserQuestions].filter(Boolean).join(' ')
  const results = search.search(query).map((result) => ({
    chunk: result as unknown as DocsChunk & { score: number },
    score: result.score * (result.path === normalizedCurrentPath ? 1.15 : 1),
  }))

  results.sort((left, right) => right.score - left.score)

  const candidates =
    results.length > 0
      ? results.map(({ chunk }) => chunk)
      : chunks.filter((chunk) => chunk.path === normalizedCurrentPath)

  const contexts: DocsContext[] = []
  const perPage = new Map<string, number>()
  let characterCount = 0

  for (const chunk of candidates) {
    if (contexts.length >= maxContexts) break

    const pageCount = perPage.get(chunk.path) ?? 0
    if (pageCount >= maxContextsPerPage) continue

    const remainingCharacters = maxCharacters - characterCount
    if (remainingCharacters <= 0) break

    const content = chunk.content.slice(0, remainingCharacters).trim()
    if (!content) continue

    contexts.push({
      title: chunk.title,
      path: chunk.path,
      heading: chunk.heading === chunk.title ? undefined : chunk.heading,
      content,
    })
    perPage.set(chunk.path, pageCount + 1)
    characterCount += content.length
  }

  return contexts
}

export function getDocsSources(contexts: DocsContext[]): DocsSource[] {
  const seenPaths = new Set<string>()

  return contexts
    .filter((context) => {
      if (seenPaths.has(context.path)) return false
      seenPaths.add(context.path)
      return true
    })
    .map(({ title, path }) => ({ title, path }))
}

function chunkPage(page: DocsPageSource): DocsChunk[] {
  const markdown = stripFrontmatter(page.content).trim()
  if (!markdown) return []

  const title = page.title?.trim() || extractPageTitle(markdown) || 'Terraforge Docs'
  const body = markdown.replace(/^#\s+.+$/m, '').trim()
  const sections = splitSections(body, title)
  let chunkIndex = 0

  return sections.flatMap((section) =>
    splitOversizedSection(section.content).map((content) => ({
      id: `${page.path}#${chunkIndex++}`,
      title,
      path: page.path,
      heading: section.heading,
      content,
    })),
  )
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function extractPageTitle(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
}

function splitSections(markdown: string, pageTitle: string) {
  const lines = markdown.split(/\r?\n/)
  const sections: Array<{ heading: string; content: string }> = []
  let heading = pageTitle
  let content: string[] = []

  const flush = () => {
    const sectionContent = content.join('\n').trim()
    if (sectionContent) sections.push({ heading, content: sectionContent })
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)$/)
    if (headingMatch?.[1]) {
      flush()
      heading = headingMatch[1].trim()
      content = [line]
    } else {
      content.push(line)
    }
  }

  flush()
  return sections
}

function splitOversizedSection(content: string) {
  if (content.length <= MaxChunkCharacters) return [content]

  const chunks: string[] = []
  let current = ''

  for (const paragraph of content.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length <= MaxChunkCharacters) {
      current = next
      continue
    }

    if (current) chunks.push(current)
    current = paragraph

    while (current.length > MaxChunkCharacters) {
      chunks.push(current.slice(0, MaxChunkCharacters))
      current = current.slice(MaxChunkCharacters)
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}
