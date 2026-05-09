import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { CacheDao } from '../cache/cache.dao'
import { SearchApi } from './search-api'
import { SearXngApi } from './searxng-api'
import { TavilyApi } from './tavily-api'
import {
  SearchError,
  SearchRateLimitError,
  type SearchEngineProvider,
  type SearchResult,
} from './search.type'

const makeProvider = (
  name: string,
  impl: (query: string) => Promise<SearchResult[]>,
): SearchEngineProvider => ({
  name,
  search: mock(impl),
})

const result = (url: string): SearchResult => ({ url, title: url, content: '', score: 0 })

describe(SearchApi.name, () => {
  let sqlite: Database
  let db: BunSQLiteDatabase
  let cache: CacheDao

  beforeEach(() => {
    sqlite = new Database(':memory:')
    db = drizzle(sqlite)
    migrate(db, { migrationsFolder: './drizzle' })
    cache = new CacheDao(db)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('should hit a provider on cache miss and persist the response', async () => {
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => [result('https://a')])
    const api = new SearchApi([free], cache)

    const first = await api.search('cats')
    expect(first).toEqual([result('https://a')])
    expect(free.search).toHaveBeenCalledTimes(1)

    const stored = cache.get(SearchApi.cacheKey('cats'))
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual([result('https://a')])
  })

  it('should serve subsequent identical queries from cache without calling providers', async () => {
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => [result('https://a')])
    const api = new SearchApi([free], cache)

    await api.search('cats')
    await api.search('cats')
    await api.search('cats')

    expect(free.search).toHaveBeenCalledTimes(1)
  })

  it('should treat whitespace-only differences as the same cache key', async () => {
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => [result('https://a')])
    const api = new SearchApi([free], cache)

    await api.search('cats')
    await api.search('  cats  ')

    expect(free.search).toHaveBeenCalledTimes(1)
  })

  it('should keep different queries in independent cache entries', async () => {
    const free = makeProvider(`${SearXngApi.name}-bing`, async (q) => [result(`https://${q}`)])
    const api = new SearchApi([free], cache)

    const a = await api.search('cats')
    const b = await api.search('dogs')

    expect(a).toEqual([result('https://cats')])
    expect(b).toEqual([result('https://dogs')])
    expect(free.search).toHaveBeenCalledTimes(2)
  })

  it('should cache empty result arrays so retries are not paid for', async () => {
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => [])
    const api = new SearchApi([free], cache)

    expect(await api.search('nonsense')).toEqual([])
    expect(await api.search('nonsense')).toEqual([])
    expect(free.search).toHaveBeenCalledTimes(1)
  })

  it('should not cache failures — errors must propagate and let the next call retry', async () => {
    let calls = 0
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => {
      calls++
      if (calls === 1) throw new SearchError('boom')
      return [result('https://recovered')]
    })
    const api = new SearchApi([free], cache)

    await expect(api.search('cats')).rejects.toBeInstanceOf(SearchError)
    expect(cache.get(SearchApi.cacheKey('cats'))).toBeNull()

    const second = await api.search('cats')
    expect(second).toEqual([result('https://recovered')])
  })

  it('should cool down a free provider that hits a rate limit and not cache the failure', async () => {
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => {
      throw new SearchRateLimitError('429')
    })
    const paid = makeProvider(TavilyApi.name, async () => [result('https://paid')])
    const api = new SearchApi([free, paid], cache)

    await expect(api.search('cats')).rejects.toBeInstanceOf(SearchRateLimitError)
    expect(api.freeLb.useHealthy()).toBeNull()
    expect(cache.get(SearchApi.cacheKey('cats'))).toBeNull()
  })

  it('should fall through to a paid provider when no free providers exist', async () => {
    const paid = makeProvider(TavilyApi.name, async () => [result('https://paid')])
    const api = new SearchApi([paid], cache)

    expect(await api.search('cats')).toEqual([result('https://paid')])
    expect(paid.search).toHaveBeenCalledTimes(1)
  })

  it('should throw when no providers are available', async () => {
    const api = new SearchApi([], cache)
    await expect(api.search('cats')).rejects.toBeInstanceOf(SearchError)
  })

  it('should always hit providers when caching is disabled', async () => {
    const disabled = new CacheDao(db, { enabled: false })
    const free = makeProvider(`${SearXngApi.name}-bing`, async () => [result('https://a')])
    const api = new SearchApi([free], disabled)

    await api.search('cats')
    await api.search('cats')
    await api.search('cats')

    expect(free.search).toHaveBeenCalledTimes(3)
  })
})
