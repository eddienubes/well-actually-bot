import { tavily } from '@tavily/core'
import { BraveApi } from './brave-api'
import { SearXngApi, SEARXNG_ENGINES } from './searxng-api'
import { env } from '../config'
import type { SearchEngineProvider, SearchEngineProviderName, SearchResult } from './search.type'

export class SearchApi {
  private readonly providers: Map<SearchEngineProviderName, SearchEngineProvider>

  constructor() {
    const braveApi = new BraveApi()
    const searxngApi = new SearXngApi()
    const tavilyApi = tavily({ apiKey: env.TAVILY_API_TOKEN })

    const providers: SearchEngineProvider[] = [
      {
        name: 'brave-official',
        search: async (query) => {
          const res = await braveApi.search({ q: query })
          return (res.web?.results ?? []).map((r) => ({
            url: r.url,
            title: r.title,
            content: r.description,
            score: 0,
          }))
        },
      },
      {
        name: 'tavily-official',
        search: async (query) => {
          const res = await tavilyApi.search(query)
          return res.results.map((r) => ({
            url: r.url,
            title: r.title,
            content: r.content,
            score: r.score,
          }))
        },
      },
      ...SEARXNG_ENGINES.map(
        (engine): SearchEngineProvider => ({
          name: `seaxng-${engine}`,
          search: async (query) => {
            const res = await searxngApi.search({ q: query, engines: [engine] })
            return res.results.map((r) => ({
              url: r.url,
              title: r.title,
              content: r.content,
              score: r.score,
            }))
          },
        }),
      ),
    ]

    this.providers = new Map(providers.map((p) => [p.name, p]))
  }

  async search(
    query: string,
    providers: SearchEngineProviderName[] = ['seaxng-google'],
  ): Promise<SearchResult[]> {
    const targets = providers
      ? providers.map((p) => this.providers.get(p)).filter((p) => p !== undefined)
      : [...this.providers.values()]

    const results = await Promise.allSettled(targets.map((p) => p.search(query)))

    return results
      .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
  }
}
