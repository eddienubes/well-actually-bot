import Firecrawl, { type SearchResultWeb } from '@mendable/firecrawl-js'
import { env } from '../config'
import { SearchError } from './search.type'
import type { SearchEngineProvider, SearchResult } from './search.type'

export class FirecrawlApi implements SearchEngineProvider {
  readonly name = FirecrawlApi.name
  private readonly client = new Firecrawl({ apiKey: env.FIRECRAWL_API_TOKEN })

  async search(query: string): Promise<SearchResult[]> {
    try {
      const res = await this.client.search(query, {
        scrapeOptions: { formats: [] },
        limit: env.WEB_SEARCH_TOOL_TOP_K,
      })
      const hits = res.web as SearchResultWeb[]
      return hits.map((hit) => ({
        url: hit.url,
        title: hit.title || '',
        content: hit.description || '',
        score: 0,
      }))
    } catch (error) {
      throw new SearchError('FireCrawl has failed', error)
    }
  }
}
