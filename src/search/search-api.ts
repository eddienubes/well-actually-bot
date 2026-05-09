import { env } from '../config'
import { LoadBalancer } from '../load-balancer'
import { BraveApi } from './brave-api'
import {
  SearchError,
  SearchRateLimitError,
  type SearchEngineProvider,
  type SearchResult,
} from './search.type'
import { SearXngApi } from './searxng-api'
import { TavilyApi } from './tavily-api'
import { FirecrawlApi } from './firecrawl-api'

export class SearchApi implements SearchEngineProvider {
  readonly name = SearchApi.name
  readonly freeLb: LoadBalancer<SearchEngineProvider>
  readonly paidLb: LoadBalancer<SearchEngineProvider>

  constructor(providers: SearchEngineProvider[]) {
    this.freeLb = new LoadBalancer(providers.filter((p) => p.name.startsWith(SearXngApi.name)))
    this.paidLb = new LoadBalancer(
      providers.filter((p) => [TavilyApi.name, BraveApi.name, FirecrawlApi.name].includes(p.name)),
    )
  }

  async search(query: string): Promise<SearchResult[]> {
    const freeEngine = this.freeLb.getHealthy()
    const paidEngine = this.paidLb.getHealthy()

    if (freeEngine) {
      try {
        return await freeEngine.search(query)
      } catch (error) {
        if (error instanceof SearchRateLimitError) {
          this.freeLb.cooldown(
            (item) => item.name === freeEngine.name,
            env.SEARCH_ENGINE_COOLDOWN_MS,
          )
        }
        throw error
      }
    }

    if (paidEngine) {
      return await paidEngine.search(query)
    }

    throw new SearchError('No search engine is available')
  }
}
