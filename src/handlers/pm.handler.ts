import { createHandler, type HandlerCtx } from './handler'
import type { ManagedBrowser } from '../managed-browser'
import { AIMessageChunk, createAgent, HumanMessage, SystemMessage } from 'langchain'
import { createWebSearchTool, createWebFetchTool } from '../tools'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { SearchEngineProvider } from '../search/search.type'
import type { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { CacheDao } from '../cache/cache.dao'
import type { Reranker } from '../reranker'
import { ChatPromptTemplate } from '@langchain/core/prompts'

const systemPromptTemplate = ChatPromptTemplate.fromTemplate(`
You are a helpful "Well, Actually" assistant.
Your task is to validate facts, search information and spellcheck according to user's query.
You must always reply in user's language to eliminate understanding barrier.
You're running as a Telegram Bot, therefore you must keep your responses plaintext and not use markdown, otherwise your responses
will not be rendered properly.
Keep your answers short and concise under 1 paragraph long.
Avoid using em-dashes.

Today's date is {date}
`)

export const pmHandler = createHandler(
  async (
    handlerCtx: HandlerCtx,
    browser: ManagedBrowser,
    llm: BaseChatModel,
    search: SearchEngineProvider,
    splitter: RecursiveCharacterTextSplitter,
    cache: CacheDao,
    reranker: Reranker,
  ) => {
    handlerCtx.bot.on('message:text', async (ctx) => {
      await using browserCtx = await browser.ctx()
      const agent = createAgent({
        model: llm,
        tools: [
          createWebSearchTool(search),
          createWebFetchTool(browser, browserCtx.value, splitter, reranker, cache),
        ],
      })
      const systemPrompt = await systemPromptTemplate.invoke({ date: new Date() })
      const stream = await agent.stream(
        {
          messages: [
            new SystemMessage(systemPrompt.toString()),
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
  },
)
