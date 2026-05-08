import { Bot } from 'grammy'
import { env } from './config'
import { ChatOpenAI } from '@langchain/openai'
import { AIMessageChunk, createAgent, HumanMessage, SystemMessage } from 'langchain'
import { SearXngApi } from './searxng-api'
import { ManagedBrowser } from './managed-browser'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { Reranker } from './reranker'
import { createWebSearchTool, createWebFetchToll as createWebFetchTool } from './tools'
import { autoRetry } from '@grammyjs/auto-retry'
import { createLoggerMiddleware, getLogger } from './logger/logger'

const bot = new Bot(env.BOT_TOKEN)

export const main = async (): Promise<void> => {
  const llm = new ChatOpenAI({
    model: 'mercury-2',
    apiKey: env.INCEPTION_API_KEY,
    configuration: {
      baseURL: 'https://api.inceptionlabs.ai/v1',
    },
  })
  const searxng = new SearXngApi()
  const browser = await ManagedBrowser.serve()
  const splitter = new RecursiveCharacterTextSplitter()
  const reranker = await Reranker.create()

  bot.on('message:text', async (ctx) => {
    await using browserCtx = await browser.ctx()
    const agent = createAgent({
      model: llm,
      tools: [
        createWebSearchTool(searxng),
        createWebFetchTool(browser, browserCtx.value, splitter, reranker),
      ],
    })
    const stream = await agent.stream(
      {
        messages: [
          new SystemMessage(
            `You are a helpful "Well, Actually" assistant.
Today's date is ${new Date().toISOString()}
You MUST NOT use markdown. 
Keep your answers under 1 paragraph long.
            `,
          ),
          new HumanMessage(ctx.message.text),
        ],
      },
      {
        streamMode: ['messages'],
      },
    )
    let content: string = ''
    for await (const [_, event] of stream) {
      const [chunk] = event
      if (AIMessageChunk.isInstance(chunk) && chunk.text) {
        content += chunk.text
        await ctx.replyWithDraft(content)
      }
    }
    await ctx.reply(content, {
      link_preview_options: {
        is_disabled: true,
      },
    })
  })
  bot.catch(async (error) => {
    console.log(error)
  })
  bot.use(createLoggerMiddleware())
  bot.api.config.use(autoRetry())
  const logger = getLogger('main')
  await bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => {
      logger.info(
        {
          ...botInfo,
          logFilePath: env.LOG_FILE_PATH,
        },
        `The bot's started`,
      )
    },
  })
}

void main()
