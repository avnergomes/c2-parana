# 11 — GITHUB ACTIONS CRONS: ETL de Dados e Workflows

## Descrição
Cria todos os workflows de GitHub Actions para atualização automática de dados: clima (30min), agro (diário), saúde (semanal), meio ambiente (6h), notícias (15min), legislativo (diário), keepalive e scripts Python ETL para cada fonte.

## Pré-requisitos
- Prompts 01 e 02 concluídos (projeto e Supabase configurados)
- Repositório público no GitHub (para Actions ilimitadas)
- Secrets configurados no repositório

## Secrets Necessários no GitHub

Configure em Settings → Secrets and variables → Actions:
```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NASA_FIRMS_KEY=sua_chave_firms
WAQI_TOKEN=seu_token_waqi
```

---

## Prompt para o Claude Code

```
Vou criar todos os GitHub Actions workflows e scripts ETL Python para o C2 Paraná. Execute todos os passos.

## PASSO 1: Criar scripts/requirements.txt

```
supabase==2.3.0
requests==2.31.0
python-dotenv==1.0.0
feedparser==6.0.11
geojson==3.1.0
python-dateutil==2.9.0
```

## PASSO 2: Criar scripts/etl_clima.py

```python
#!/usr/bin/env python3
"""ETL Clima: busca dados das estações INMET do PR e salva no Supabase."""

import os
import requests
import json
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Estações INMET no Paraná (código INMET → nome/município/IBGE)
PR_STATIONS = {
    "A807": {"name": "Curitiba", "municipality": "Curitiba", "ibge": "4106902", "lat": -25.434, "lon": -49.266},
    "A834": {"name": "Londrina", "municipality": "Londrina", "ibge": "4113700", "lat": -23.363, "lon": -51.190},
    "A820": {"name": "Maringá", "municipality": "Maringá", "ibge": "4115200", "lat": -23.403, "lon": -51.999},
    "A843": {"name": "Cascavel", "municipality": "Cascavel", "ibge": "4104808", "lat": -24.957, "lon": -53.455},
    "A847": {"name": "Foz do Iguaçu", "municipality": "Foz do Iguaçu", "ibge": "4108304", "lat": -25.535, "lon": -54.604},
    "A823": {"name": "Ponta Grossa", "municipality": "Ponta Grossa", "ibge": "4119905", "lat": -25.093, "lon": -50.166},
    "A840": {"name": "Guarapuava", "municipality": "Guarapuava", "ibge": "4109401", "lat": -25.388, "lon": -51.508},
    "A835": {"name": "Apucarana", "municipality": "Apucarana", "ibge": "4101303", "lat": -23.554, "lon": -51.437},
    "A865": {"name": "Paranaguá", "municipality": "Paranaguá", "ibge": "4118204", "lat": -25.526, "lon": -48.525},
    "A836": {"name": "Campo Mourão", "municipality": "Campo Mourão", "ibge": "4104402", "lat": -24.044, "lon": -52.393},
    "A851": {"name": "Toledo", "municipality": "Toledo", "ibge": "4127700", "lat": -24.718, "lon": -53.745},
    "A826": {"name": "Umuarama", "municipality": "Umuarama", "ibge": "4128104", "lat": -23.767, "lon": -53.330},
}

def fetch_station_data(station_code: str, date_ini: str, date_fim: str) -> list:
    """Busca dados de uma estação INMET."""
    url = f"https://apitempo.inmet.gov.br/estacao/dados/{station_code}/{date_ini}/{date_fim}"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"  Erro na estação {station_code}: {e}")
        return []

def parse_station_record(record: dict, station_code: str, meta: dict) -> dict | None:
    """Converte um registro INMET para o formato do banco."""
    try:
        # Campos INMET: TEM_INS (temp), UMD_INS (umidade), PRE_INS (pressão),
        # VEN_VEL (vento m/s), VEN_DIR (direção), CHUVA (precipitação)
        # DT_MEDICAO e HR_MEDICAO para timestamp

        dt_str = record.get("DT_MEDICAO", "")
        hr_str = record.get("HR_MEDICAO", "0000")
        
        if not dt_str:
            return None

        hr_fmt = hr_str.zfill(4)
        observed_at = f"{dt_str}T{hr_fmt[:2]}:{hr_fmt[2:]}:00-03:00"

        def safe_float(val):
            if val is None or val == "" or val == "-9999":
                return None
            try:
                return float(str(val).replace(",", "."))
            except:
                return None

        return {
            "station_code": station_code,
            "station_name": meta["name"],
            "municipality": meta["municipality"],
            "ibge_code": meta["ibge"],
            "latitude": meta["lat"],
            "longitude": meta["lon"],
            "temperature": safe_float(record.get("TEM_INS")),
            "humidity": safe_float(record.get("UMD_INS")),
            "pressure": safe_float(record.get("PRE_INS")),
            "wind_speed": safe_float(record.get("VEN_VEL")),
            "wind_direction": int(safe_float(record.get("VEN_DIR")) or 0) if record.get("VEN_DIR") else None,
            "precipitation": safe_float(record.get("CHUVA")),
            "observed_at": observed_at,
        }
    except Exception as e:
        print(f"  Erro ao parsear registro: {e}")
        return None

def fetch_alerts() -> list:
    """Busca alertas meteorológicos INMET."""
    url = "https://apialerta.inmet.gov.br/v4/avisos"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        alerts = []
        for item in (data if isinstance(data, list) else []):
            # Filtrar alertas que afetam o Paraná
            uf = item.get("estados", [])
            if isinstance(uf, list) and "PR" not in uf:
                continue
            if isinstance(uf, str) and "PR" not in uf:
                continue

            severity_map = {
                "VERMELHO": "critical",
                "LARANJA": "high",
                "AMARELO": "medium",
                "VERDE": "low",
            }
            cor = item.get("cor", "").upper()
            severity = severity_map.get(cor, "info")

            alerts.append({
                "source": "inmet",
                "severity": severity,
                "title": item.get("evento", "Alerta Meteorológico"),
                "description": item.get("descricao") or item.get("endArea") or None,
                "affected_area": item.get("geometry") or item.get("area"),
                "affected_municipalities": None,
                "starts_at": item.get("inicio"),
                "ends_at": item.get("fim"),
                "is_active": True,
                "external_id": str(item.get("id") or item.get("idAlerta", "")),
                "raw_data": item,
            })
        return alerts
    except Exception as e:
        print(f"Erro ao buscar alertas: {e}")
        return []

def main():
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    now = datetime.now()
    date_fim = now.strftime("%Y-%m-%d")
    date_ini = (now - timedelta(hours=6)).strftime("%Y-%m-%d")

    print(f"Buscando dados INMET: {date_ini} a {date_fim}")

    all_records = []
    for station_code, meta in PR_STATIONS.items():
        print(f"  Estação {station_code} — {meta['name']}")
        raw_data = fetch_station_data(station_code, date_ini, date_fim)
        
        for record in raw_data[-2:]:  # apenas últimas 2 medições
            parsed = parse_station_record(record, station_code, meta)
            if parsed and parsed.get("temperature") is not None:
                all_records.append(parsed)

    if all_records:
        result = supabase.table("climate_data").upsert(
            all_records,
            on_conflict="station_code,observed_at"
        ).execute()
        print(f"Inseridos/atualizados: {len(all_records)} registros de clima")

        # Limpar dados com mais de 48h
        cutoff = (now - timedelta(hours=48)).isoformat()
        supabase.table("climate_data").delete().lt("observed_at", cutoff).execute()
        print("Dados antigos limpos (>48h)")
    else:
        print("Nenhum dado de clima para inserir")

    # Buscar e salvar alertas
    print("Buscando alertas INMET...")
    alerts = fetch_alerts()
    
    if alerts:
        # Desativar alertas antigos do INMET
        supabase.table("alerts").update({"is_active": False}).eq("source", "inmet").execute()
        
        result = supabase.table("alerts").upsert(
            alerts,
            on_conflict="external_id"
        ).execute()
        print(f"Alertas salvos: {len(alerts)}")
    else:
        print("Nenhum alerta INMET para o PR")

    print("ETL Clima concluído!")

if __name__ == "__main__":
    main()
```

## PASSO 3: Criar scripts/etl_saude.py

```python
#!/usr/bin/env python3
"""ETL Saúde: InfoDengue por município PR + OpenDataSUS."""

import os
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Geocodes IBGE dos municípios do PR (os 399)
# Buscar do IBGE API para lista completa
def get_pr_municipalities():
    """Busca lista de municípios PR do IBGE."""
    url = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        return [{"ibge": str(m["id"]), "name": m["nome"]} for m in data]
    except:
        # Fallback: apenas principais
        return [
            {"ibge": "4106902", "name": "Curitiba"},
            {"ibge": "4113700", "name": "Londrina"},
            {"ibge": "4115200", "name": "Maringá"},
            {"ibge": "4104808", "name": "Cascavel"},
            {"ibge": "4108304", "name": "Foz do Iguaçu"},
        ]

def fetch_dengue(ibge_code: str, weeks: int = 4) -> list:
    """Busca alertas de dengue do InfoDengue para um município."""
    url = f"https://info.dengue.mat.br/api/alertcity?geocode={ibge_code}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start=2024&ey_end=2025"
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        return []
    except:
        return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print("Buscando municípios PR...")
    municipios = get_pr_municipalities()
    print(f"Total: {len(municipios)} municípios")
    
    all_dengue = []
    
    for i, mun in enumerate(municipios):
        if i % 50 == 0:
            print(f"Progresso: {i}/{len(municipios)}")
        
        records = fetch_dengue(mun["ibge"])
        
        for rec in records[-4:]:  # últimas 4 semanas
            try:
                se = int(rec.get("SE", 0))
                year = int(str(se)[:4]) if se > 10000 else 2025
                week = int(str(se)[4:]) if se > 10000 else se
                
                all_dengue.append({
                    "ibge_code": mun["ibge"],
                    "municipality_name": mun["name"],
                    "epidemiological_week": week,
                    "year": year,
                    "cases": int(rec.get("casos", 0) or 0),
                    "cases_est": float(rec.get("casos_est", 0) or 0),
                    "alert_level": int(rec.get("nivel", 0) or 0),
                    "incidence_rate": float(rec.get("inc100k", 0) or 0),
                    "population": int(rec.get("pop", 0) or 0) or None,
                })
            except:
                continue
    
    if all_dengue:
        # Inserir em lotes de 100
        for i in range(0, len(all_dengue), 100):
            batch = all_dengue[i:i+100]
            supabase.table("dengue_data").upsert(
                batch,
                on_conflict="ibge_code,year,epidemiological_week"
            ).execute()
        print(f"Dengue: {len(all_dengue)} registros salvos")
    
    print("ETL Saúde concluído!")

if __name__ == "__main__":
    main()
```

## PASSO 4: Criar scripts/etl_ambiente.py

```python
#!/usr/bin/env python3
"""ETL Ambiente: NASA FIRMS focos de calor + ANA rios + AQICN qualidade do ar."""

import os
import io
import csv
import requests
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
NASA_FIRMS_KEY = os.environ.get("NASA_FIRMS_KEY", "DEMO_KEY")
WAQI_TOKEN = os.environ.get("WAQI_TOKEN", "demo")

# Bounding box Paraná: lon_min, lat_min, lon_max, lat_max
PR_BBOX = "-54,-26.7,-48.0,-22.5"

CIDADES_AR = [
    {"id": "curitiba", "slug": "curitiba"},
    {"id": "londrina", "slug": "londrina"},
    {"id": "maringa", "slug": "maringa"},
    {"id": "foz", "slug": "foz-do-iguacu"},
]

def fetch_firms():
    """Busca focos de calor VIIRS SNPP do NASA FIRMS."""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_KEY}/VIIRS_SNPP_NRT/{PR_BBOX}/1"
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        
        reader = csv.DictReader(io.StringIO(resp.text))
        spots = []
        for row in reader:
            try:
                spots.append({
                    "latitude": float(row.get("latitude", 0)),
                    "longitude": float(row.get("longitude", 0)),
                    "brightness": float(row.get("bright_ti4", 0)) if row.get("bright_ti4") else None,
                    "scan": float(row.get("scan", 0)) if row.get("scan") else None,
                    "track": float(row.get("track", 0)) if row.get("track") else None,
                    "acq_date": row.get("acq_date", datetime.now().date().isoformat()),
                    "acq_time": row.get("acq_time"),
                    "satellite": row.get("satellite"),
                    "instrument": "VIIRS",
                    "confidence": row.get("confidence"),
                })
            except:
                continue
        print(f"FIRMS: {len(spots)} focos encontrados")
        return spots
    except Exception as e:
        print(f"Erro FIRMS: {e}")
        return []

def fetch_aqicn():
    """Busca qualidade do ar AQICN para cidades PR."""
    records = []
    for city in CIDADES_AR:
        url = f"https://api.waqi.info/feed/{city['slug']}/?token={WAQI_TOKEN}"
        try:
            resp = requests.get(url, timeout=15)
            data = resp.json()
            
            if data.get("status") != "ok":
                continue
            
            d = data["data"]
            iaqi = d.get("iaqi", {})
            
            records.append({
                "city": city["id"],
                "station_name": d.get("city", {}).get("name"),
                "aqi": int(d.get("aqi", 0)) if d.get("aqi") != "-" else None,
                "dominant_pollutant": d.get("dominentpol"),
                "pm25": float(iaqi.get("pm25", {}).get("v", 0)) if iaqi.get("pm25") else None,
                "pm10": float(iaqi.get("pm10", {}).get("v", 0)) if iaqi.get("pm10") else None,
                "o3": float(iaqi.get("o3", {}).get("v", 0)) if iaqi.get("o3") else None,
                "no2": float(iaqi.get("no2", {}).get("v", 0)) if iaqi.get("no2") else None,
                "co": float(iaqi.get("co", {}).get("v", 0)) if iaqi.get("co") else None,
                "observed_at": d.get("time", {}).get("iso") or datetime.now().isoformat(),
            })
        except Exception as e:
            print(f"  Erro AQICN {city['id']}: {e}")
    
    print(f"AQICN: {len(records)} cidades coletadas")
    return records

def fetch_ana_rivers():
    """Busca estações e nível de rios ANA para o PR."""
    url = "https://www.ana.gov.br/ANA_Telemetrica/api/estacoes?codEstado=41"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        
        estacoes = data if isinstance(data, list) else data.get("items", [])
        records = []
        
        for est in estacoes[:50]:  # Limitar para não sobrecarregar
            try:
                records.append({
                    "station_code": str(est.get("codEstacao") or est.get("codigo", "")),
                    "station_name": est.get("nomeEstacao") or est.get("nome", ""),
                    "river_name": est.get("nomeRio") or est.get("rio"),
                    "municipality": est.get("municipio"),
                    "ibge_code": str(est.get("codMunicipio") or "") or None,
                    "latitude": float(est.get("latitude", 0)) if est.get("latitude") else None,
                    "longitude": float(est.get("longitude", 0)) if est.get("longitude") else None,
                    "level_cm": float(est.get("cota") or est.get("nivel_cm", 0)) if est.get("cota") or est.get("nivel_cm") else None,
                    "flow_m3s": None,
                    "alert_level": "normal",
                    "observed_at": est.get("dataMedicao") or datetime.now().isoformat(),
                })
            except:
                continue
        
        print(f"ANA: {len(records)} estações coletadas")
        return records
    except Exception as e:
        print(f"Erro ANA: {e}")
        return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # NASA FIRMS
    print("Buscando focos de calor NASA FIRMS...")
    spots = fetch_firms()
    if spots:
        supabase.table("fire_spots").upsert(spots).execute()
        # Limpar focos com mais de 30 dias
        cutoff = (datetime.now() - timedelta(days=30)).date().isoformat()
        supabase.table("fire_spots").delete().lt("acq_date", cutoff).execute()
    
    # AQICN
    print("Buscando qualidade do ar AQICN...")
    aq_records = fetch_aqicn()
    if aq_records:
        supabase.table("air_quality").insert(aq_records).execute()
        # Limpar dados com mais de 7 dias
        cutoff = (datetime.now() - timedelta(days=7)).isoformat()
        supabase.table("air_quality").delete().lt("observed_at", cutoff).execute()
    
    # ANA
    print("Buscando nível dos rios ANA...")
    rivers = fetch_ana_rivers()
    if rivers:
        supabase.table("river_levels").upsert(
            rivers,
            on_conflict="station_code"
        ).execute()
    
    print("ETL Ambiente concluído!")

if __name__ == "__main__":
    main()
```

## PASSO 5: Criar scripts/etl_noticias.py

```python
#!/usr/bin/env python3
"""ETL Notícias: RSS feeds + classificação de urgência."""

import os
import hashlib
import feedparser
import requests
from datetime import datetime, timezone
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
    cutoff = (datetime.now(timezone.utc).replace(
        day=datetime.now().day - 7
    )).isoformat()
    from dateutil.relativedelta import relativedelta
    from dateutil import parser as dateparser
    cutoff_dt = datetime.now(timezone.utc) - __import__('datetime').timedelta(days=7)
    supabase.table("news_items").delete().lt("published_at", cutoff_dt.isoformat()).execute()
    print("Notícias antigas limpas (>7 dias)")
    
    print("ETL Notícias concluído!")

if __name__ == "__main__":
    main()
```

## PASSO 6: Criar scripts/etl_legislativo.py

```python
#!/usr/bin/env python3
"""ETL Legislativo: ALEP projetos de lei, sessões e votações."""

import os
import requests
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

ALEP_BASE = "http://webservices.assembleia.pr.leg.br/api/public"

def fetch_alep_endpoint(path: str, params: dict = {}) -> list:
    """Busca dados de um endpoint da ALEP API."""
    url = f"{ALEP_BASE}/{path}"
    try:
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else data.get("items", data.get("data", []))
    except Exception as e:
        print(f"  Erro ALEP {path}: {e}")
    return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    items = []
    year = datetime.now().year
    
    # Projetos de lei recentes
    print("Buscando projetos de lei ALEP...")
    try:
        pls = fetch_alep_endpoint("proposicoes", {"ano": year, "limit": 30, "tipo": "PL"})
        for pl in pls:
            items.append({
                "external_id": f"alep-pl-{pl.get('id') or pl.get('numero')}-{year}",
                "type": "projeto_lei",
                "number": str(pl.get("numero", "")),
                "year": year,
                "title": pl.get("ementa") or pl.get("titulo") or f"PL {pl.get('numero')}/{year}",
                "description": pl.get("descricao"),
                "author": pl.get("autor") or pl.get("autores"),
                "status": pl.get("situacao") or pl.get("status"),
                "url": pl.get("link") or pl.get("url") or f"https://assembleia.pr.leg.br/busca?q=PL+{pl.get('numero')}",
                "published_at": pl.get("dataApresentacao") or pl.get("data") or datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f"Erro PLs: {e}")
    
    # Sessões recentes
    print("Buscando sessões ALEP...")
    try:
        sessoes = fetch_alep_endpoint("sessoes", {"limit": 10})
        for s in sessoes:
            items.append({
                "external_id": f"alep-sessao-{s.get('id') or s.get('numero')}-{year}",
                "type": "sessao",
                "number": str(s.get("numero", "")),
                "year": year,
                "title": s.get("tipo") or s.get("descricao") or "Sessão Plenária",
                "description": s.get("pauta"),
                "author": None,
                "status": s.get("situacao") or s.get("status"),
                "url": s.get("link") or "https://assembleia.pr.leg.br/plenario/sessao",
                "published_at": s.get("data") or datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f"Erro sessões: {e}")
    
    if items:
        supabase.table("legislative_items").upsert(
            items,
            on_conflict="external_id"
        ).execute()
        print(f"ALEP: {len(items)} itens salvos")
    else:
        print("Nenhum item legislativo encontrado (API ALEP pode estar instável)")
    
    print("ETL Legislativo concluído!")

if __name__ == "__main__":
    main()
```

## PASSO 7: Criar .github/workflows/cron-clima.yml

```yaml
# .github/workflows/cron-clima.yml
name: ETL Clima (INMET)

on:
  schedule:
    - cron: '*/30 * * * *'   # A cada 30 minutos
  workflow_dispatch:           # Execução manual

jobs:
  etl-clima:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Instalar dependências
        run: pip install -r scripts/requirements.txt

      - name: Executar ETL Clima
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python scripts/etl_clima.py
```

## PASSO 8: Criar .github/workflows/cron-saude.yml

```yaml
# .github/workflows/cron-saude.yml
name: ETL Saúde (InfoDengue)

on:
  schedule:
    - cron: '0 8 * * 1'   # Toda segunda-feira às 8h UTC (5h BRT)
  workflow_dispatch:

jobs:
  etl-saude:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r scripts/requirements.txt
      - name: Executar ETL Saúde
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python scripts/etl_saude.py
```

## PASSO 9: Criar .github/workflows/cron-ambiente.yml

```yaml
# .github/workflows/cron-ambiente.yml
name: ETL Meio Ambiente (FIRMS + ANA + AQICN)

on:
  schedule:
    - cron: '0 */6 * * *'   # A cada 6 horas
  workflow_dispatch:

jobs:
  etl-ambiente:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r scripts/requirements.txt
      - name: Executar ETL Ambiente
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          NASA_FIRMS_KEY: ${{ secrets.NASA_FIRMS_KEY }}
          WAQI_TOKEN: ${{ secrets.WAQI_TOKEN }}
        run: python scripts/etl_ambiente.py
```

## PASSO 10: Criar .github/workflows/cron-noticias.yml

```yaml
# .github/workflows/cron-noticias.yml
name: ETL Notícias (RSS)

on:
  schedule:
    - cron: '*/15 * * * *'   # A cada 15 minutos
  workflow_dispatch:

jobs:
  etl-noticias:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r scripts/requirements.txt
      - name: Executar ETL Notícias
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python scripts/etl_noticias.py
```

## PASSO 11: Criar .github/workflows/cron-legislativo.yml

```yaml
# .github/workflows/cron-legislativo.yml
name: ETL Legislativo (ALEP)

on:
  schedule:
    - cron: '0 9 * * *'   # Diariamente às 9h UTC (6h BRT)
  workflow_dispatch:

jobs:
  etl-legislativo:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r scripts/requirements.txt
      - name: Executar ETL Legislativo
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python scripts/etl_legislativo.py
```

## PASSO 12: Criar .github/workflows/keepalive.yml

```yaml
# .github/workflows/keepalive.yml
# Evita que o repositório seja desativado por inatividade (GitHub desativa após 60 dias sem push)
name: Keepalive

on:
  schedule:
    - cron: '0 12 1 * *'   # Dia 1 de cada mês ao meio-dia
  workflow_dispatch:

jobs:
  keepalive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Update keepalive timestamp
        run: |
          echo "Last keepalive: $(date -u)" > .keepalive
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add .keepalive
          git commit -m "chore: keepalive $(date -u +%Y-%m)" || echo "Nothing to commit"
          git push || echo "Nothing to push"
```
```

---

## Arquivos Criados/Modificados

```
scripts/
├── requirements.txt                      (CRIADO)
├── etl_clima.py                          (CRIADO)
├── etl_saude.py                          (CRIADO)
├── etl_ambiente.py                       (CRIADO)
├── etl_noticias.py                       (CRIADO)
└── etl_legislativo.py                    (CRIADO)
.github/workflows/
├── cron-clima.yml                        (CRIADO)
├── cron-saude.yml                        (CRIADO)
├── cron-ambiente.yml                     (CRIADO)
├── cron-noticias.yml                     (CRIADO)
├── cron-legislativo.yml                  (CRIADO)
└── keepalive.yml                         (CRIADO)
```

---

## Verificação

1. Configurar secrets no GitHub (Settings → Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NASA_FIRMS_KEY`, `WAQI_TOKEN`
2. Ir em Actions → "ETL Clima" → "Run workflow" (manual) → verificar logs
3. Verificar no Supabase Dashboard que `climate_data` foi populado
4. Testar `etl_noticias.py` localmente: `cd scripts && pip install -r requirements.txt && python etl_noticias.py`
5. Após 15min, verificar que workflow de notícias foi acionado automaticamente

---

## Notas Técnicas

- **Repositório público**: GitHub Actions tem minutos ilimitados em repositórios públicos. Em repos privados, há limite de 2000 min/mês no plano free.
- **INMET API instabilidade**: A API INMET pode retornar erros 500 ou dados vazios. O ETL tem tratamento de erro e não quebra se uma estação falhar.
- **InfoDengue todos municípios**: Buscar 399 municípios individualmente leva ~10min. O workflow de saúde tem `timeout-minutes: 30`. Alternativamente, usar a API de agregado estadual se disponível.
- **FIRMS DEMO_KEY**: Limitado a 1 request/10min com dados desatualizados. Para produção, necessário key real (gratuita com conta Earthdata NASA).
- **ALEP API**: Endpoint público não documentado, pode mudar. Se retornar 404, verificar `http://webservices.assembleia.pr.leg.br/api/` para novos endpoints.
- **Cron timing**: GitHub Actions tem delay de até 5-10 minutos nos crons. `*/15 * * * *` pode executar a cada 15-25min na prática.
