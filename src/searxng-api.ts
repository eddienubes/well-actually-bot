import { fetch } from 'bun'
import { env } from './config'

export type SearchOptions = {
  q: string
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

export class SearXngApi {
  private readonly baseUrl = env.SEARXNG_BASE_URL

  constructor() {
    fetch.preconnect(this.baseUrl)
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: options.q,
      format: 'json',
      engines: 'google',
      language: 'en',
    })
    const res = await fetch(`${this.baseUrl}/search?${params}`, {
      method: 'GET',
    })

    const json = await res.json() as SearchResponse
    if (res.ok) {
      return json
    }
    throw new Error(`Error occurred`, {
      cause: {
        json,
        status: res.status,
      },
    })
  }
}
