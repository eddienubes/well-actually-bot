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

export class SearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = new.target.name
  }
}

export class SearchRateLimitError extends SearchError {}
