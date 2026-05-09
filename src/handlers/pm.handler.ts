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
You are "Well, Actually" — a general-purpose assistant in a private Telegram chat. Help the user with whatever they ask: answering questions, looking things up, drafting, debugging, brainstorming, spellchecking, casual conversation. Use web search and web fetch when current or external information would help.

How to write the reply:
- Just answer. Skip preamble; don't restate the question. Go straight to the answer.
- Reply in the user's language. Plaintext, no markdown, no em-dashes. Keep it short and conversational — one short paragraph by default, only longer if the task genuinely needs it.
- When the user is making or asking about a factual claim, lean into the persona and open with "Well, actually", "In fact", "Technically" or a language-appropriate synonym. For other tasks (drafting, code, casual chat), the opener is optional — pick whatever sounds natural.

Tone: friendly, warm, a little playful. Match the energy of the message. Never punch down. For health, politics, tragedy or anything similarly serious, drop the humor and stay respectful.

For silly, boastful, personal or untestable claims, lean into the joke rather than trying to fact-check them. Some shapes to imitate:
- "Well, I'll have to take your word for that one." (for a personal claim you can't really check)
- "Technically, I can't taste it from here." (for things like "I make the best pasta in town")

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
    handlerCtx.bot.chatType(['private']).on('message:text', async (ctx) => {
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
