import crypto from 'node:crypto'
import { env } from '../config'
import { LoadBalancer } from '../load-balancer'
import { CacheDao } from '../cache/cache.dao'
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
import { getLogWriter } from '../logger/logger'

const CACHE_KEY_PREFIX = 'search:v1'

export class SearchApi implements SearchEngineProvider {
  readonly name = SearchApi.name
  readonly freeLb: LoadBalancer<SearchEngineProvider>
  readonly paidLb: LoadBalancer<SearchEngineProvider>
  private readonly cache: CacheDao
  private readonly log = getLogWriter(SearchApi.name)

  constructor(providers: SearchEngineProvider[], cache: CacheDao) {
    this.freeLb = new LoadBalancer(providers.filter((p) => p.name.startsWith(SearXngApi.name)))
    this.paidLb = new LoadBalancer(
      providers.filter((p) => [TavilyApi.name, BraveApi.name, FirecrawlApi.name].includes(p.name)),
    )
    this.cache = cache
  }

  async search(query: string): Promise<SearchResult[]> {
    const key = SearchApi.cacheKey(query)
    const cached = this.cache.get(key)
    if (cached !== null) {
      return JSON.parse(cached) as SearchResult[]
    }

    const freeEngine = this.freeLb.useHealthy()

    if (freeEngine) {
      this.log.write({
        engine: freeEngine.name,
      })
      try {
        const results = await freeEngine.search(query)
        this.cache.set(key, JSON.stringify(results), env.SEARCH_CACHE_TTL_MS)
        return results
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
    const paidEngine = this.paidLb.useHealthy()

    if (paidEngine) {
      const cooldownEngines = this.freeLb.listCooldownItems()
      this.log.write({
        engine: paidEngine?.name,
        cooldownEngines,
      })
      const results = await paidEngine.search(query)
      this.cache.set(key, JSON.stringify(results), env.SEARCH_CACHE_TTL_MS)
      return results
    }

    throw new SearchError('No search engine is available')
  }

  static cacheKey(query: string): string {
    const hash = crypto.createHash('sha256').update(query.trim()).digest('hex')
    return `${CACHE_KEY_PREFIX}:${hash}`
  }
}
