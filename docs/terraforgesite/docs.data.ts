import { createContentLoader } from 'vitepress'
import { buildDocsCorpus, normalizeDocsPath } from './.vitepress/services/docs-search'

declare const data: ReturnType<typeof buildDocsCorpus>
export { data }

export default createContentLoader('**/*.md', {
  includeSrc: true,
  render: false,
  transform(pages) {
    return buildDocsCorpus(
      pages.map((page) => ({
        title: typeof page.frontmatter.title === 'string' ? page.frontmatter.title : undefined,
        path: normalizeDocsPath(page.url),
        content: page.src ?? '',
      })),
    )
  },
})
