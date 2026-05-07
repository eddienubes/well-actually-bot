import { Bot } from 'grammy'
import { env } from './config'
import { ChatOpenAI } from '@langchain/openai'
import crypto from 'node:crypto'
import { MemorySaver } from '@langchain/langgraph'
import { AIMessageChunk, createAgent, HumanMessage, SystemMessage } from 'langchain'
import { SearXngApi } from './searxng-api'
import { ManagedBrowser } from './managed-browser'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { Reranker } from './reranker'
import { createWebSearchTool, createWebFetchToll as createWebFetchTool } from './tools'
import { autoRetry } from '@grammyjs/auto-retry'

const bot = new Bot(env.BOT_TOKEN)
bot.api.config.use(autoRetry())

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

  const threadId = crypto.randomUUID()
  const checkpointer = new MemorySaver()

  bot.on('message:text', async (ctx) => {
    await using browserCtx = await browser.ctx()
    const agent = createAgent({
      model: llm,
      checkpointer,
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
Reply in concise, yet coherent way.
            `,
          ),
          new HumanMessage(ctx.message.text),
        ],
      },
      {
        configurable: {
          thread_id: threadId,
        },
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
    await ctx.reply(content)
  })
  await bot.start()
}

void main()
