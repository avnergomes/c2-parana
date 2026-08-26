// supabase/functions/etl-noticias/index.ts
// RSS de noticias do Parana + classificacao de urgencia.
//
// Porte Deno de scripts/etl_noticias.py (a especificacao). 5 feeds RSS/Atom,
// 20 itens por feed, classificacao urgent/important/normal por keywords,
// upsert em news_items por url e limpeza de itens com mais de 7 dias.
//
// Parsing: extracao por bloco <item>/<entry> com regex por tag + decode de
// CDATA/entidades. Deliberadamente NAO usa deno_dom em modo HTML porque
// <link> e void element em HTML — o parser dropava o conteudo do <link> dos
// feeds RSS 2.0 e todo link viria vazio. Feeds sao XML gerado por maquina;
// a extracao por tag dentro do bloco do item e estavel para os 5 feeds.
//
// Divergencia deliberada vs Python: o feedparser tolera feeds com encoding
// declarado errado; aqui fetchText decodifica UTF-8 explicitamente (os 5
// feeds servem UTF-8). Validar acentos no passo 5 do cutover.

import {
  runEtl,
  fetchText,
  type RunResult,
  type SupabaseClient,
} from '../_shared/etl.ts'

const RSS_FEEDS = [
  { id: 'gazeta', url: 'https://www.gazetadopovo.com.br/rss' },
  { id: 'g1pr', url: 'https://g1.globo.com/rss/g1/parana/' },
  { id: 'aen', url: 'https://www.parana.pr.gov.br/noticias/rss' },
  { id: 'bandab', url: 'https://bandab.com.br/feed/' },
  {
    id: 'gnews',
    url: 'https://news.google.com/rss/search?q=Paran%C3%A1&hl=pt-BR&gl=BR&ceid=BR:pt-419',
  },
]

const URGENT_KEYWORDS = [
  'acidente', 'emergência', 'tragédia', 'morto', 'mortes', 'vítima',
  'explosão', 'incêndio', 'enchente', 'desastre', 'colapso', 'desabamento',
  'epidemia', 'surto', 'alerta máximo', 'evacuação', 'bloqueio',
]

const IMPORTANT_KEYWORDS = [
  'decreto', 'lei aprovada', 'votação', 'aprovado', 'vetado', 'sancionado',
  'operação policial', 'prisão', 'preso', 'investigação',
  'chuva intensa', 'temporal', 'granizo', 'seca',
  'reajuste', 'aumento', 'queda', 'recorde',
]

interface NewsItem {
  source: string
  title: string
  description: string | null
  url: string
  image_url: string | null
  published_at: string
  urgency: string
  category: null
  keywords: null
}

// --------------------------------------------------------------------------
// XML helpers
// --------------------------------------------------------------------------

/** Decodifica CDATA e as entidades XML/HTML comuns em feeds. */
function decodeXml(raw: string): string {
  let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  text = text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&') // por ultimo, senao &amp;lt; decodifica errado
  return text.trim()
}

/** Conteudo de texto da primeira ocorrencia de <tag> dentro do bloco. */
function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  const m = block.match(re)
  return m ? decodeXml(m[1]) : ''
}

/** Valor de um atributo na primeira ocorrencia de <tag ...>. */
function tagAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\s[^>]*?\\b${attr}\\s*=\\s*"([^"]*)"`, 'i')
  const m = block.match(re)
  return m ? decodeXml(m[1]) : ''
}

function extractLink(block: string): string {
  // RSS 2.0: <link>url</link>
  const plain = tagText(block, 'link')
  if (plain.startsWith('http')) return plain
  // Atom: <link rel="alternate" href="..."/> (ou o primeiro href que houver)
  const alternate = block.match(
    /<link\s[^>]*rel\s*=\s*"alternate"[^>]*href\s*=\s*"([^"]*)"/i,
  )
  if (alternate) return decodeXml(alternate[1])
  const href = tagAttr(block, 'link', 'href')
  return href
}

function extractPublished(block: string): string {
  const raw =
    tagText(block, 'pubDate') ||
    tagText(block, 'published') ||
    tagText(block, 'updated') ||
    tagText(block, 'dc:date')
  if (raw) {
    const ms = Date.parse(raw)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  return new Date().toISOString()
}

function extractImage(block: string): string | null {
  // media:content (Media RSS)
  const media = tagAttr(block, 'media:content', 'url')
  if (media) return media
  // enclosure com type de imagem
  const enclosure = block.match(/<enclosure\s[^>]*>/i)
  if (enclosure) {
    const tag = enclosure[0]
    const type = tag.match(/\btype\s*=\s*"([^"]*)"/i)?.[1] ?? ''
    if (type.includes('image')) {
      const url =
        tag.match(/\bhref\s*=\s*"([^"]*)"/i)?.[1] ??
        tag.match(/\burl\s*=\s*"([^"]*)"/i)?.[1]
      if (url) return decodeXml(url)
    }
  }
  return null
}

function classifyUrgency(title: string, description: string): string {
  const text = `${title} ${description ?? ''}`.toLowerCase()
  if (URGENT_KEYWORDS.some((kw) => text.includes(kw))) return 'urgent'
  if (IMPORTANT_KEYWORDS.some((kw) => text.includes(kw))) return 'important'
  return 'normal'
}

// --------------------------------------------------------------------------
// Feed
// --------------------------------------------------------------------------

async function fetchFeed(feedId: string, feedUrl: string): Promise<NewsItem[]> {
  try {
    const xml = await fetchText(feedUrl, { timeoutMs: 20_000 })
    const blocks = [
      ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
      ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
    ].map((m) => m[0])

    const items: NewsItem[] = []
    for (const block of blocks.slice(0, 20)) {
      const title = tagText(block, 'title')
      if (!title) continue
      const link = extractLink(block)
      if (!link) continue

      // feedparser mapeia description -> summary; manter a mesma precedencia
      const description = tagText(block, 'description') || tagText(block, 'summary')

      items.push({
        source: feedId,
        title,
        description: description ? description.slice(0, 500) : null,
        url: link,
        image_url: extractImage(block),
        published_at: extractPublished(block),
        urgency: classifyUrgency(title, description),
        category: null,
        keywords: null,
      })
    }
    return items
  } catch (err) {
    console.warn(`feed ${feedId}: ${(err as Error).message}`)
    return []
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'noticias', async (client: SupabaseClient): Promise<RunResult> => {
    const perFeed: Record<string, number> = {}
    const allItems: NewsItem[] = []

    for (const feed of RSS_FEEDS) {
      const items = await fetchFeed(feed.id, feed.url)
      perFeed[feed.id] = items.length
      allItems.push(...items)
    }

    // Dedup por url dentro do lote: o mesmo link pode vir de 2 feeds (gnews
    // agrega os demais) e um lote com chave repetida faz o upsert falhar com
    // "cannot affect row a second time".
    const byUrl = new Map<string, NewsItem>()
    for (const item of allItems) byUrl.set(item.url, item)
    const deduped = [...byUrl.values()]

    if (deduped.length > 0) {
      const { error } = await client
        .from('news_items')
        .upsert(deduped, { onConflict: 'url' })
      if (error) throw new Error(`news_items upsert: ${error.message}`)
    }

    // Limpeza: mais de 7 dias
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { error: delError } = await client
      .from('news_items')
      .delete()
      .lt('published_at', cutoff)
    if (delError) console.warn(`limpeza news_items: ${delError.message}`)

    const feedsOk = Object.values(perFeed).filter((n) => n > 0).length
    return {
      status: deduped.length === 0 ? 'empty' : feedsOk < RSS_FEEDS.length ? 'partial' : 'success',
      items_saved: deduped.length,
      per_feed: perFeed,
    }
  })
)
