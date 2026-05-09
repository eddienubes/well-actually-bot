export interface SearchEngineProvider<O = unknown> {
  readonly name: string
  search(query: string, options?: O): Promise<SearchResult[]>
}

export type SearchResult = {
  url: string
  title: string
  content: string
  score: number
}
