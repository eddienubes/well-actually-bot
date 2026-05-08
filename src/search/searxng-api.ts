import { fetch } from 'bun'
import { env } from '../config'
import { SearXngApiError } from './search.error'

export type SearchOptions = {
  q: string
  engines: SEARXNG_ENGINES[]
}

export type SearchResult = {
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

export type SearchResponse = {
  query: string
  number_of_results: number
  results: SearchResult[]
  answers: string[]
  corrections: string[]
  infoboxes: unknown[]
  suggestions: string[]
  unresponsive_engines: string[]
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

export class SearXngApi {
  private readonly baseUrl = env.SEARXNG_BASE_URL

  constructor() {
    fetch.preconnect(this.baseUrl)
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: options.q,
      format: 'json',
      engines: options.engines.join(','),
      language: 'en',
    })
    const res = await fetch(`${this.baseUrl}/search?${params}`, {
      method: 'GET',
    })

    const json = (await res.json()) as SearchResponse
    if (res.ok) {
      return json
    }
    throw new SearXngApiError('SearXNG API error', { status: res.status, body: json })
  }
}
