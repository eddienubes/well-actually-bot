import { tavily } from '@tavily/core'
import { env } from '../config'
import type { SearchEngineProvider, SearchResult } from './search.type'
import { SearchError } from './search.type'

export class TavilyApi implements SearchEngineProvider {
  readonly name = TavilyApi.name;
  private readonly client = tavily({ apiKey: env.TAVILY_API_TOKEN })

  async search(query: string): Promise<SearchResult[]> {
    try {
      const res = await this.client.search(query)
      return res.results.map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content,
        score: r.score,
      }))
    } catch (error) {
      throw new SearchError('Tavily has failed', error)
    }
  }
}
