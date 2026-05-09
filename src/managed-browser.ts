import { lightpanda, type LightpandaServeOptions } from '@lightpanda/browser'
import cp from 'node:child_process'
import { type Browser, type BrowserContext } from 'puppeteer-core'
import puppeteer from 'puppeteer-core'
import { DisposableOf } from './utils/utils'
import ntm from 'node-html-markdown'
import { write } from 'bun'

const filters = {
  // order matters
  // e.g. removing scripts allows us to remove cases where scripts are inside <a> tags
  common: [
    'script',
    'svg',
    'img',
    'br',
    'hr',
    'noscript',
    'link',
    'style',
    'nav',
    'footer',
    'header',
    'sup',
    'figure',
    'form',
    'button',
    'aside',
    '.ad',
    '.ads',
    '[class*="cookie"]',
    '[class*="banner"]',
    '[aria-hidden="true"]',
    'a',
    'iframe',
    // wikipedia
    '#catlinks',
  ],
}
const postprocesses: ((input: string) => string)[] = [
  // repeated chars in general
  (input) => input.replaceAll(/(.)\1{6,}/gs, '$1'),
  // replace repeated newlines with a single newline
  (input) => input.replaceAll(/\n{2,}/g, '\n'),
]

type BrowserOptions = {
  proc: cp.ChildProcessWithoutNullStreams
  browser: Browser
}

type FetchOptions = {
  ctx: BrowserContext
}

const defaults: LightpandaServeOptions = {
  host: '127.0.0.1',
  port: 9222,
}

export class ManagedBrowser {
  protected readonly options: BrowserOptions

  private constructor(options: BrowserOptions) {
    this.options = options
  }

  async ctx(): Promise<DisposableOf<BrowserContext>> {
    return new DisposableOf(
      await this.options.browser.createBrowserContext(),
      async (ctx) => await ctx.close(),
    )
  }

    async fetch(url: string, options: FetchOptions): Promise<string> {
    await using page = new DisposableOf(await options.ctx.newPage(), async (page) => page.close())
    await page.value.goto(url)
    await page.value.evaluate((filters) => {
      const els = document.querySelectorAll(filters.common.join(','))
      for (const el of els) {
        if (el.tagName === 'A') {
          el.parentNode?.replaceChild(document.createTextNode(el.textContent), el)
          continue
        }
        el.parentNode?.removeChild(el)
      }
    }, filters)
    const html = await page.value.content()
    await write('raw.html', html)
    let markdown = ntm.NodeHtmlMarkdown.translate(html)
    for (const fn of postprocesses) {
      markdown = fn(markdown)
    }
    return markdown
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.options.browser.close()

    this.options.proc.stdout.destroy()
    this.options.proc.stderr.destroy()
    this.options.proc.kill()
  }

  static async serve(options: LightpandaServeOptions = defaults): Promise<ManagedBrowser> {
    const proc = await lightpanda.serve({})
    const browser = await puppeteer.connect({
      browserWSEndpoint: `ws://${options.host}:${options.port}`,
    })
    return new ManagedBrowser({
      proc,
      browser,
    })
  }
}
