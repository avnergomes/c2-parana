#!/usr/bin/env python3
"""ETL Notícias: RSS feeds + classificação de urgência."""

import os
import feedparser
from datetime import datetime, timezone, timedelta
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

RSS_FEEDS = [
    {"id": "gazeta", "url": "https://www.gazetadopovo.com.br/rss"},
    {"id": "g1pr", "url": "https://g1.globo.com/rss/g1/parana/"},
    {"id": "aen", "url": "https://www.parana.pr.gov.br/noticias/rss"},
    {"id": "bandab", "url": "https://bandab.com.br/feed/"},
    {"id": "gnews", "url": "https://news.google.com/rss/search?q=Paran%C3%A1&hl=pt-BR&gl=BR&ceid=BR:pt-419"},
]

URGENT_KEYWORDS = [
    "acidente", "emergência", "tragédia", "morto", "mortes", "vítima",
    "explosão", "incêndio", "enchente", "desastre", "colapso", "desabamento",
    "epidemia", "surto", "alerta máximo", "evacuação", "bloqueio",
]

IMPORTANT_KEYWORDS = [
    "decreto", "lei aprovada", "votação", "aprovado", "vetado", "sancionado",
    "operação policial", "prisão", "preso", "investigação",
    "chuva intensa", "temporal", "granizo", "seca",
    "reajuste", "aumento", "queda", "recorde",
]

def classify_urgency(title: str, description: str = "") -> str:
    text = (title + " " + (description or "")).lower()
    if any(kw in text for kw in URGENT_KEYWORDS):
        return "urgent"
    if any(kw in text for kw in IMPORTANT_KEYWORDS):
        return "important"
    return "normal"

def fetch_feed(feed_id: str, feed_url: str) -> list:
    try:
        feed = feedparser.parse(feed_url)
        items = []

        for entry in feed.entries[:20]:
            title = entry.get("title", "").strip()
            if not title:
                continue

            link = entry.get("link", "").strip()
            if not link:
                continue

            description = entry.get("summary", "") or entry.get("description", "")

            # Parse data
            pub = entry.get("published_parsed") or entry.get("updated_parsed")
            if pub:
                published_at = datetime(*pub[:6], tzinfo=timezone.utc).isoformat()
            else:
                published_at = datetime.now(timezone.utc).isoformat()

            # Imagem
            image_url = None
            if hasattr(entry, "media_content"):
                media = entry.media_content
                if media and len(media) > 0:
                    image_url = media[0].get("url")
            if not image_url and hasattr(entry, "enclosures") and entry.enclosures:
                enc = entry.enclosures[0]
                if "image" in enc.get("type", ""):
                    image_url = enc.get("href") or enc.get("url")

            urgency = classify_urgency(title, description)

            items.append({
                "source": feed_id,
                "title": title,
                "description": description[:500] if description else None,
                "url": link,
                "image_url": image_url,
                "published_at": published_at,
                "urgency": urgency,
                "category": None,
                "keywords": None,
            })

        return items
    except Exception as e:
        print(f"  Erro no feed {feed_id}: {e}")
        return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_items = []
    for feed in RSS_FEEDS:
        print(f"Buscando {feed['id']}...")
        items = fetch_feed(feed["id"], feed["url"])
        all_items.extend(items)
        print(f"  {len(items)} itens")

    if all_items:
        # Upsert com deduplicação por URL
        result = supabase.table("news_items").upsert(
            all_items,
            on_conflict="url"
        ).execute()
        print(f"Total: {len(all_items)} notícias salvas")

    # Limpar notícias com mais de 7 dias
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=7)
    supabase.table("news_items").delete().lt("published_at", cutoff_dt.isoformat()).execute()
    print("Notícias antigas limpas (>7 dias)")

    print("ETL Notícias concluído!")

if __name__ == "__main__":
    main()
