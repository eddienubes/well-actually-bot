import { type ContentBlock, tool } from 'langchain'
import z from 'zod'
import type { ManagedBrowser } from './managed-browser'
import type { BrowserContext } from 'puppeteer-core'
import type { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Reranker } from './reranker'
import { env } from './config'
import { getLogger } from './logger/logger'

export const createWebSearchTool = (searchApi: SearXngApi) => {
  const logger = getLogger('web_search_tool')
  return tool(
    async (input): Promise<ContentBlock.Text[] | string> => {
      const response = await searchApi.search({
        q: input.query,
      })
      logger.debug(response, `got result`)

      if (!response.results.length) {
        return `No results for ${input.query}`
      }
      return response.results.map((hit) => ({
        type: 'text',
        text: `${hit.url}\n${hit.title}\n${hit.content}`,
      }))
    },
    {
      name: 'web_search_tool',
      description: `
- Allows you to search the web and use the results to build your responses
- Provides up-to-date information for current events and recent data
- Returns search result information from a search engine
- Use this tool for accessing information your knowledge cutoff
- Searches are performed automatically within a single API call
- The tool nicely combines with the "web_fetch_tool", if you need to read a particular webpage further

IMPORTANT 
- Use the correct year in search queries:
- The current date is ${new Date().toISOString()}. You MUST use this date when searching for recent information, documentation, or current events.
`,
      schema: z.object({
        query: z.string().describe('A query you want to search in the web'),
      }),
    },
  )
}

export const createWebFetchToll = (
  browser: ManagedBrowser,
  ctx: BrowserContext,
  splitter: RecursiveCharacterTextSplitter,
  reranker: Reranker,
) => {
  return tool(
    async (input): Promise<ContentBlock.Text[]> => {
      const content = await browser.fetch(input.url, {
        ctx,
      })
      const splits = await splitter.splitText(content)
      const rankedChunks = await reranker.rank(input.query, splits)
      return rankedChunks.slice(0, env.WEB_FETCH_TOOL_TOP_K).map((chunk) => ({
        type: 'text',
        text: chunk.text,
      }))
    },
    {
      name: 'web_fetch_tool',
      description: `
Use this tool to fetch content from a particular webpage by its URL
    `,
      schema: z.object({
        url: z.url().describe('The URL of the page'),
        query: z
          .string()
          .min(5)
          .describe(
            'The query you used to find this URL, you can tailor it towards the content you expect to find on the page to optimize the results',
          ),
      }),
    },
  )
}
