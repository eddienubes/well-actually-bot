import { Bot } from 'grammy'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { env } from './config'
import { ChatOpenAI } from '@langchain/openai'
import { SearchApi } from './search/search-api'
import { ManagedBrowser } from './managed-browser'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { Reranker } from './reranker'
import { autoRetry } from '@grammyjs/auto-retry'
import { createCatchMiddleware, createLoggerMiddleware, getLogger } from './logger/logger'
import { TavilyApi } from './search/tavily-api'
import { SearXngApi } from './search/searxng-api'
import { BraveApi } from './search/brave-api'
import { FirecrawlApi } from './search/firecrawl-api'
import { CacheDao } from './cache/cache.dao'
import { limit } from '@grammyjs/ratelimiter'
import { pmHandler } from './handlers/pm.handler'

const bot = new Bot(env.BOT_TOKEN)

export const main = async (): Promise<void> => {
  const llm = new ChatOpenAI({
    model: 'mercury-2',
    apiKey: env.INCEPTION_API_KEY,
    configuration: {
      baseURL: 'https://api.inceptionlabs.ai/v1',
    },
  })
  const db = drizzle(new Database(env.SQL_LITE_FILENAME))
  const cacheDao = new CacheDao(db, { enabled: env.CACHE_ENABLED })
  const searchApi = new SearchApi(
    [...SearXngApi.fromEngines(), new TavilyApi(), new BraveApi(), new FirecrawlApi()],
    cacheDao,
  )
  const browser = await ManagedBrowser.serve()
  const splitter = new RecursiveCharacterTextSplitter()
  const reranker = await Reranker.create()

  bot.use(createLoggerMiddleware())
  bot.api.config.use(autoRetry())
  bot.use(
    limit({
      timeFrame: env.BOT_RATE_LIMIT_WINDOW_MS,
      limit: env.BOT_RATE_LIMIT_HITS,
    }),
  )

  await pmHandler({ bot }, browser, llm, searchApi, splitter, cacheDao, reranker)
  const logger = getLogger('main')
  bot.catch(createCatchMiddleware())
  await bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => {
      logger.info({ ...botInfo, logFilePath: env.LOG_FILE_PATH }, `The bot's started`)
    },
  })
}

void main()
