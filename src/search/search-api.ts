import type { SearchEngineProvider, SearchResult } from './search.type'

export class SearchApi implements SearchEngineProvider {
  readonly name = SearchApi.name
  private readonly providers: Map<string, SearchEngineProvider>

  constructor(providers: SearchEngineProvider[]) {
    this.providers = new Map(providers.map((p) => [p.name, p]))
  }

  async search(query: string, providers: string[] = ['seaxng-google']): Promise<SearchResult[]> {
    const targets = providers
      ? providers.map((p) => this.providers.get(p)).filter((p) => p !== undefined)
      : [...this.providers.values()]

    const results = await Promise.allSettled(targets.map((p) => p.search(query)))

    return results
      .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
  }
}
