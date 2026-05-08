import { SEARXNG_ENGINES } from './searxng-api'

export type SearchApi = {}

export type SearchEngineProvider =
  | `seaxng-${SEARXNG_ENGINES[number]}`
  | 'brave-official'
  | 'tavily-official'

export type SearchResult = {
  type: string
  url: string
  title: string
  content: string
  score: number
}
