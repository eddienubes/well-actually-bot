import { fetch } from 'bun'
import { env } from './config'

export type SearchOptions = {
  q: string
}

export class SearXngApi {
  private readonly baseUrl = env.SEARXNG_BASE_URL

  constructor() {
    fetch.preconnect(this.baseUrl)
  }

  async search(options: SearchOptions): Promise<any> {
    const params = new URLSearchParams({
      q: options.q,
      format: 'json',
      engines: 'google',
      language: 'en'
    })
    const res = await fetch(`${this.baseUrl}/search?${params}`, {
      method: 'GET',
    })

    const json = await res.json()
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
