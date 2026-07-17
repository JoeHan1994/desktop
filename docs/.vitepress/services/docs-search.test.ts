import { describe, expect, it } from 'vitest'
import {
  buildDocsCorpus,
  createDocsSearch,
  getDocsSources,
  normalizeDocsPath,
  retrieveDocsContexts,
} from './docs-search'

const corpus = buildDocsCorpus([
  {
    title: 'Checkpoints and Restore',
    path: '/guide/checkpoints',
    content: `---\ntitle: ignored\n---\n# Checkpoints and Restore\n\n## Create a checkpoint\n\nOpen the session actions menu and select Create Checkpoint.`,
  },
  {
    title: 'Restore Session',
    path: '/guide/run-tasks/restore-session',
    content: '# Restore Session\n\n## Restore a machine\n\nSelect the checkpoint and run the Restore Session task.',
  },
  {
    title: 'Monitoring',
    path: '/guide/monitoring',
    content: '# Monitoring\n\n## Logs\n\nUse Monitoring to inspect task logs.',
  },
])

describe('docs search', () => {
  it('normalizes generated VitePress URLs to runtime route paths', () => {
    expect(normalizeDocsPath('/guide/checkpoints.html')).toBe('/guide/checkpoints')
    expect(normalizeDocsPath('/features/index.html')).toBe('/features/')
    expect(normalizeDocsPath('/index.html')).toBe('/')
    expect(normalizeDocsPath('/docs/guide/checkpoints.html', '/docs/')).toBe('/guide/checkpoints')
  })

  it('splits markdown into searchable sections without frontmatter', () => {
    expect(corpus).toHaveLength(3)
    expect(corpus[0]).toMatchObject({
      title: 'Checkpoints and Restore',
      heading: 'Create a checkpoint',
      path: '/guide/checkpoints',
    })
    expect(corpus[0]?.content).not.toContain('title: ignored')
  })

  it('retrieves relevant sections across multiple pages', () => {
    const contexts = retrieveDocsContexts(
      createDocsSearch(corpus),
      corpus,
      'How do I create a checkpoint and restore a session?',
      '/guide/monitoring',
    )

    expect(contexts.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['/guide/checkpoints', '/guide/run-tasks/restore-session']),
    )
  })

  it('falls back to the current page and enforces context budgets', () => {
    const contexts = retrieveDocsContexts(createDocsSearch(corpus), corpus, 'unmatchedterm', '/guide/monitoring', [], {
      maxContexts: 1,
      maxCharacters: 20,
    })

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.path).toBe('/guide/monitoring')
    expect(contexts[0]?.content.length).toBeLessThanOrEqual(20)
  })

  it('falls back to the current page for non-English queries on a base-prefixed production URL', () => {
    const contexts = retrieveDocsContexts(
      createDocsSearch(corpus),
      corpus,
      '如何创建和还原检查点？',
      '/docs/guide/checkpoints.html',
      [],
      { base: '/docs/' },
    )

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.path).toBe('/guide/checkpoints')
  })

  it('limits the number of excerpts selected from one page', () => {
    const repeatedPage = buildDocsCorpus([
      {
        title: 'Sessions',
        path: '/features/sessions',
        content:
          '# Sessions\n\n## First action\n\nsession action\n\n## Second action\n\nsession action\n\n## Third action\n\nsession action',
      },
    ])
    const contexts = retrieveDocsContexts(
      createDocsSearch(repeatedPage),
      repeatedPage,
      'session action',
      '/features/sessions',
    )

    expect(contexts).toHaveLength(2)
  })

  it('deduplicates source pages while preserving retrieval order', () => {
    const sources = getDocsSources([
      { title: 'Sessions', path: '/features/sessions', heading: 'Actions', content: 'One' },
      { title: 'Sessions', path: '/features/sessions', heading: 'Status', content: 'Two' },
      { title: 'Checkpoints', path: '/guide/checkpoints', content: 'Three' },
    ])

    expect(sources).toEqual([
      { title: 'Sessions', path: '/features/sessions' },
      { title: 'Checkpoints', path: '/guide/checkpoints' },
    ])
  })
})
