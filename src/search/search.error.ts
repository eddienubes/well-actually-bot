export class SearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = new.target.name
  }
}

export class BraveApiError extends SearchError {}

export class SearXngApiError extends SearchError {}

export class TavilyApiError extends SearchError {}
