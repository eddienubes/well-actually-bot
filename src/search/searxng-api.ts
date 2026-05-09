import { fetch } from 'bun'
import { env } from '../config'
import {
  SearchError,
  SearchRateLimitError,
  type SearchEngineProvider,
  type SearchResult,
} from './search.type'

export type SearXngSearchOptions = {
  engines: SEARXNG_ENGINES[]
}

export type SearXngSearchResult = {
  url: string
  title: string
  content: string
  thumbnail: string | null
  engine: string
  template: string
  parsed_url: string[]
  img_src: string
  priority: string
  engines: string[]
  positions: number[]
  score: number
  category: string
  publishedDate: string | null
}

export type SearXngSearchResponse = {
  query: string
  number_of_results: number
  results: SearXngSearchResult[]
  answers: string[]
  corrections: string[]
  infoboxes: unknown[]
  suggestions: string[]
  unresponsive_engines: [string, string][]
}

export const SEARXNG_ENGINES = [
  'google',
  'brave',
  'duckduckgo',
  'mojeek',
  'qwant',
  'startpage',
  'yahoo',
  'bing',
] as const
export type SEARXNG_ENGINES = (typeof SEARXNG_ENGINES)[number]

export class SearXngApi implements SearchEngineProvider<SearXngSearchOptions> {
  readonly name = SearXngApi.name
  private readonly baseUrl = env.SEARXNG_BASE_URL

  constructor() {
    fetch.preconnect(this.baseUrl)
  }

  async search(query: string, options: SearXngSearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      engines: options.engines.join(','),
      language: 'en',
    })
    const res = await fetch(`${this.baseUrl}/search?${params}`, {
      method: 'GET',
    })

    const json = (await res.json()) as SearXngSearchResponse
    if (!res.ok) {
      throw new SearchError('SearXNG API error', {
        status: res.status,
        body: json,
      })
    }

    const unresponsiveHit = json.unresponsive_engines.find(([engine]) =>
      options.engines.includes(engine as SEARXNG_ENGINES),
    )

    if (unresponsiveHit) {
      throw new SearchRateLimitError(`searxng rate limit`, unresponsiveHit)
    }

    return json.results.map((r) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      score: r.score,
    }))
  }

  static fromEngines(): SearchEngineProvider[] {
    return SEARXNG_ENGINES.map((engine) => {
      const api = new SearXngApi()
      return {
        name: `${api.name}-${engine}`,
        search: async (query) => await api.search(query, { engines: [engine] }),
      }
    })
  }
}
