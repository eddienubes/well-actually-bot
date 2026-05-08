import { SEARXNG_ENGINES } from './searxng-api'

export interface SearchEngineProvider {
  readonly name: SearchEngineProviderName
  search(query: string): Promise<SearchResult[]>
}

export type SearchEngineProviderName =
  | `seaxng-${SEARXNG_ENGINES}`
  | 'brave-official'
  | 'tavily-official'

export type SearchResult = {
  url: string
  title: string
  content: string
  score: number
}
