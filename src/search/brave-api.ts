import { fetch } from 'bun'
import { env } from '../config'
import { BraveApiError } from './search.error'
import type { SearchEngineProvider, SearchResult } from './search.type'

const BASE_URL = 'https://api.search.brave.com/res/v1'

export type BraveSearchOptions = {
  q: string
  count?: number
  offset?: number
  country?: string
  search_lang?: string
  safesearch?: 'off' | 'moderate' | 'strict'
  freshness?: 'pd' | 'pw' | 'pm' | 'py' | string
  extra_snippets?: boolean
}

export type BraveWebResult = {
  title: string
  url: string
  description: string
  age?: string
  extra_snippets?: string[]
}

export type BraveLocationResult = {
  id: string
  title: string
}

export type BraveSearchResponse = {
  query: {
    original: string
    more_results_available: boolean
  }
  web?: {
    results: BraveWebResult[]
  }
  locations?: {
    results: BraveLocationResult[]
  }
}

export class BraveApi implements SearchEngineProvider {
  readonly name = BraveApi.name
  private readonly baseUrl = BASE_URL

  constructor() {
    fetch.preconnect(this.baseUrl)
  }

  async search(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query })

    const res = await fetch(`${this.baseUrl}/web/search?${params}`, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': env.BRAVE_API_TOKEN,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    })

    const json = (await res.json()) as BraveSearchResponse
    if (!res.ok) {
      throw new BraveApiError('Brave Search API error', { status: res.status, body: json })
    }

    return (json.web?.results ?? []).map((r) => ({
      url: r.url,
      title: r.title,
      content: r.description,
      score: 0,
    }))
  }
}
