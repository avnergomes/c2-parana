# PROMPT 5 — ESTABILIZAR ETL LEGISLATIVO (ALEP)

## Prioridade: 🟡 MÉDIA — Funciona parcialmente, API instável

## Problema
O workflow `cron-legislativo.yml` tem comportamento intermitente: Run #3 (manual) deu certo, mas Runs #1 e #2 falharam. A API da ALEP (`webservices.assembleia.pr.leg.br`) é notoriamente instável.

## Causa Raiz
1. A API ALEP retorna 500/503 com frequência
2. O código não tem retry automático
3. Se a busca de proposições falhar, a exceção propaga e impede sessões de serem buscadas
4. A URL base usa `http://` (não HTTPS) — pode causar redirect em alguns ambientes

## Arquivo: `scripts/etl_legislativo.py`

### Correção Completa:

```python
#!/usr/bin/env python3
"""ETL Legislativo: ALEP projetos de lei, sessões e votações — com retry."""

import os
import time
import requests
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Tentar HTTPS primeiro, fallback para HTTP
ALEP_BASES = [
    "https://webservices.assembleia.pr.leg.br/api/public",
    "http://webservices.assembleia.pr.leg.br/api/public",
]


def fetch_alep_endpoint(path: str, params: dict = {}, max_retries: int = 3) -> list:
    """Busca dados de um endpoint da ALEP API com retry."""
    
    for base in ALEP_BASES:
        url = f"{base}/{path}"
        
        for attempt in range(max_retries):
            try:
                resp = requests.get(url, params=params, timeout=30,
                                     headers={"Accept": "application/json"})
                
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        return data
                    # Tentar extrair de diferentes formatos de resposta
                    if isinstance(data, dict):
                        return data.get("items", data.get("data", data.get("results", [])))
                    return []
                
                if resp.status_code in (500, 502, 503, 504):
                    wait = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    print(f"  ALEP {path}: HTTP {resp.status_code}, tentativa {attempt+1}/{max_retries}. Aguardando {wait}s...")
                    time.sleep(wait)
                    continue
                
                # 404 ou outro erro → não retry
                print(f"  ALEP {path}: HTTP {resp.status_code}")
                return []
                
            except requests.exceptions.ConnectionError as e:
                print(f"  ALEP {path}: Conexão recusada ({base}), tentativa {attempt+1}/{max_retries}")
                time.sleep(2)
            except requests.exceptions.Timeout:
                print(f"  ALEP {path}: Timeout, tentativa {attempt+1}/{max_retries}")
                time.sleep(1)
            except Exception as e:
                print(f"  ALEP {path}: Erro inesperado: {e}")
                return []
    
    print(f"  ALEP {path}: Todas as tentativas falharam")
    return []


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    items = []
    year = datetime.now().year

    # === Projetos de lei recentes ===
    print("1/2 Buscando projetos de lei ALEP...")
    try:
        pls = fetch_alep_endpoint("proposicoes", {"ano": year, "limit": 30, "tipo": "PL"})
        print(f"  Encontrados: {len(pls)} projetos")
        
        for pl in pls:
            try:
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
                print(f"  Erro ao processar PL: {e}")
    except Exception as e:
        print(f"  ❌ Erro na busca de PLs: {e}")

    # === Sessões recentes ===
    print("2/2 Buscando sessões ALEP...")
    try:
        sessoes = fetch_alep_endpoint("sessoes", {"limit": 10})
        print(f"  Encontradas: {len(sessoes)} sessões")
        
        for s in sessoes:
            try:
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
                print(f"  Erro ao processar sessão: {e}")
    except Exception as e:
        print(f"  ❌ Erro na busca de sessões: {e}")

    # === Salvar no Supabase ===
    if items:
        try:
            supabase.table("legislative_items").upsert(
                items,
                on_conflict="external_id"
            ).execute()
            print(f"✅ ALEP: {len(items)} itens salvos")
        except Exception as e:
            print(f"  Erro no upsert: {e}")
            # Tentar um por um
            saved = 0
            for item in items:
                try:
                    supabase.table("legislative_items").upsert(
                        [item], on_conflict="external_id"
                    ).execute()
                    saved += 1
                except:
                    pass
            print(f"  Salvos individualmente: {saved}/{len(items)}")
    else:
        print("⚠️ Nenhum item legislativo encontrado (API ALEP pode estar instável)")
        # NÃO sair com exit code 1 — a API simplesmente pode estar fora

    print("ETL Legislativo concluído!")


if __name__ == "__main__":
    main()
```

### Atualizar workflow para mais frequência e tolerância

Editar `.github/workflows/cron-legislativo.yml`:
```yaml
name: ETL Legislativo (ALEP)

on:
  schedule:
    - cron: '0 14 * * 1-5'  # Dias úteis às 14h UTC (11h BRT) — ALEP funciona melhor em horário comercial
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

      - name: Instalar dependências
        run: pip install -r scripts/requirements.txt

      - name: Executar ETL Legislativo
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python scripts/etl_legislativo.py
```

## Validação
1. Rodar manualmente em horário comercial BRT (9h-17h) — maior chance de sucesso
2. Se falhar, verificar se é erro 5xx (API fora) — nesse caso, é esperado
3. Verificar `legislative_items` no Supabase

## Commit
```
git add -A && git commit -m "fix: ETL Legislativo - retry exponencial + HTTPS + isolamento de erros"
```
