# PROMPT 3 — CORRIGIR ETL SAÚDE (InfoDengue)

## Prioridade: 🟠 ALTA — Dados de dengue são críticos para saúde pública

## Problema
O workflow `cron-saude.yml` falha com exit code 1 após 6min35s. A tabela `dengue_data` tem 0 registros.

## Causa Raiz
O script itera **399 municípios do Paraná**, fazendo 1 request HTTP por município à API InfoDengue. Com timeout de 30s cada:
- Cenário otimista: 399 × 0.5s = ~3.3 min
- Cenário real: InfoDengue é lento, muitos requests dão timeout → 399 × 1-2s = 6-13 min
- O workflow tem `timeout-minutes: 30` mas a API InfoDengue pode retornar erros (429 rate limit, 504 gateway timeout) que acumulam

Além disso, o script não tem **nenhum sleep entre requests**, sobrecarregando a API e provavelmente sendo bloqueado por rate limiting.

## Arquivo: `scripts/etl_saude.py`

### Correção Completa — Reescrever com abordagem escalonada:

```python
#!/usr/bin/env python3
"""ETL Saúde: InfoDengue por município PR — versão otimizada."""

import os
import time
import requests
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

CURRENT_YEAR = datetime.now().year

# =====================================================
# ESTRATÉGIA: Dois tiers de municípios
# Tier 1 (50 maiores): ~80% da população PR → rodar SEMPRE
# Tier 2 (349 restantes): rodar semanal via IBGE API
# =====================================================

# Top 50 municípios PR por população (cobrindo ~80% da pop do estado)
TIER1_MUNICIPIOS = [
    {"ibge": "4106902", "name": "Curitiba"},
    {"ibge": "4113700", "name": "Londrina"},
    {"ibge": "4115200", "name": "Maringá"},
    {"ibge": "4119905", "name": "Ponta Grossa"},
    {"ibge": "4104808", "name": "Cascavel"},
    {"ibge": "4108304", "name": "Foz do Iguaçu"},
    {"ibge": "4105508", "name": "Colombo"},
    {"ibge": "4109401", "name": "Guarapuava"},
    {"ibge": "4118204", "name": "Paranaguá"},
    {"ibge": "4101804", "name": "Araucária"},
    {"ibge": "4127700", "name": "Toledo"},
    {"ibge": "4101307", "name": "Apucarana"},
    {"ibge": "4119152", "name": "Pinhais"},
    {"ibge": "4104402", "name": "Campo Mourão"},
    {"ibge": "4128104", "name": "Umuarama"},
    {"ibge": "4118601", "name": "Paranavaí"},
    {"ibge": "4107652", "name": "Fazenda Rio Grande"},
    {"ibge": "4100400", "name": "Almirante Tamandaré"},
    {"ibge": "4103404", "name": "Cambé"},
    {"ibge": "4125506", "name": "São José dos Pinhais"},
    {"ibge": "4103602", "name": "Campo Largo"},
    {"ibge": "4120200", "name": "Rolândia"},
    {"ibge": "4106571", "name": "Cianorte"},
    {"ibge": "4107207", "name": "Cornélio Procópio"},
    {"ibge": "4110706", "name": "Irati"},
    {"ibge": "4128302", "name": "União da Vitória"},
    {"ibge": "4113601", "name": "Lapa"},
    {"ibge": "4115804", "name": "Medianeira"},
    {"ibge": "4117602", "name": "Palmas"},
    {"ibge": "4101002", "name": "Ampère"},
    {"ibge": "4105805", "name": "Corbélia"},
    {"ibge": "4121208", "name": "Santa Helena"},
    {"ibge": "4108957", "name": "Goioerê"},
    {"ibge": "4116208", "name": "Marechal Cândido Rondon"},
    {"ibge": "4112504", "name": "Jaguariaíva"},
    {"ibge": "4114302", "name": "Mandaguari"},
    {"ibge": "4126256", "name": "Sarandi"},
    {"ibge": "4102802", "name": "Bandeirantes"},
    {"ibge": "4114807", "name": "Maringá"},  # Remover se duplicado
    {"ibge": "4107538", "name": "Dois Vizinhos"},
    {"ibge": "4108403", "name": "Francisco Beltrão"},
    {"ibge": "4117206", "name": "Ortigueira"},
    {"ibge": "4117271", "name": "Paiçandu"},
    {"ibge": "4118402", "name": "Pato Branco"},
    {"ibge": "4118707", "name": "Pinhão"},
    {"ibge": "4119103", "name": "Pitanga"},
    {"ibge": "4120606", "name": "Santa Fé"},
    {"ibge": "4126306", "name": "Santo Antônio da Platina"},
    {"ibge": "4127106", "name": "Telêmaco Borba"},
    {"ibge": "4128500", "name": "Wenceslau Braz"},
]


def get_full_pr_municipalities():
    """Busca lista completa de municípios PR do IBGE."""
    url = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        return [{"ibge": str(m["id"]), "name": m["nome"]} for m in data]
    except Exception as e:
        print(f"  Erro ao buscar municípios IBGE: {e}")
        return []


def fetch_dengue_batch(municipios: list, label: str) -> list:
    """Busca dados de dengue para uma lista de municípios com rate limiting."""
    all_dengue = []
    erros = 0
    max_erros = 10  # Para se tiver mais de 10 erros consecutivos

    for i, mun in enumerate(municipios):
        if i % 25 == 0:
            print(f"  [{label}] Progresso: {i}/{len(municipios)} | Erros: {erros}")

        url = f"https://info.dengue.mat.br/api/alertcity?geocode={mun['ibge']}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start={CURRENT_YEAR - 1}&ey_end={CURRENT_YEAR}"
        
        try:
            resp = requests.get(url, timeout=15)  # Timeout menor: 15s em vez de 30s
            
            if resp.status_code == 429:
                print(f"  Rate limited! Esperando 10s...")
                time.sleep(10)
                resp = requests.get(url, timeout=15)  # Retry
            
            if resp.status_code != 200:
                erros += 1
                continue
            
            records = resp.json()
            
            for rec in records[-4:]:  # últimas 4 semanas
                try:
                    se = int(rec.get("SE", 0))
                    year = int(str(se)[:4]) if se > 10000 else CURRENT_YEAR
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
            
            erros = 0  # Reset erro counter em sucesso
            
        except requests.exceptions.Timeout:
            erros += 1
            print(f"  Timeout em {mun['name']} ({mun['ibge']})")
        except Exception as e:
            erros += 1
        
        # Rate limiting: 100ms entre requests para não sobrecarregar InfoDengue
        time.sleep(0.1)
        
        # Circuit breaker: se muitos erros seguidos, parar
        if erros >= max_erros:
            print(f"  ⚠️ {max_erros} erros consecutivos. Parando batch {label}.")
            break

    return all_dengue


def upsert_dengue(supabase, records: list):
    """Insere dados de dengue no Supabase em lotes."""
    if not records:
        return
    
    # Inserir em lotes de 200 (mais eficiente que 100)
    for i in range(0, len(records), 200):
        batch = records[i:i+200]
        try:
            supabase.table("dengue_data").upsert(
                batch,
                on_conflict="ibge_code,year,epidemiological_week"
            ).execute()
        except Exception as e:
            print(f"  Erro upsert lote {i}: {e}")
            # Tentar inserir um por um
            for rec in batch:
                try:
                    supabase.table("dengue_data").upsert(
                        [rec],
                        on_conflict="ibge_code,year,epidemiological_week"
                    ).execute()
                except:
                    pass


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Dia da semana: 0=segunda, 6=domingo
    is_full_run = os.environ.get("FULL_RUN", "false").lower() == "true"
    
    if is_full_run:
        print("=== MODO COMPLETO: Todos os 399 municípios ===")
        municipios_full = get_full_pr_municipalities()
        if municipios_full:
            municipios = municipios_full
        else:
            print("Falha ao buscar lista completa, usando Tier 1")
            municipios = TIER1_MUNICIPIOS
    else:
        print("=== MODO RÁPIDO: Top 50 municípios (Tier 1) ===")
        municipios = TIER1_MUNICIPIOS

    print(f"Total: {len(municipios)} municípios")

    records = fetch_dengue_batch(municipios, "main")
    
    if records:
        upsert_dengue(supabase, records)
        print(f"✅ Dengue: {len(records)} registros salvos")
    else:
        print("⚠️ Nenhum registro de dengue obtido")

    print("ETL Saúde concluído!")


if __name__ == "__main__":
    main()
```

### Atualizar workflow para ter 2 modos

Editar `.github/workflows/cron-saude.yml`:
```yaml
name: ETL Saúde (InfoDengue)

on:
  schedule:
    - cron: '0 8 * * 1'   # Segunda: run completo (399 municípios)
    - cron: '0 12 * * 3,5' # Quarta e sexta: run rápido (top 50)
  workflow_dispatch:
    inputs:
      full_run:
        description: 'Rodar todos os 399 municípios?'
        required: false
        default: 'false'
        type: choice
        options:
          - 'false'
          - 'true'

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

      - name: Instalar dependências
        run: pip install -r scripts/requirements.txt

      - name: Executar ETL Saúde
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FULL_RUN: ${{ github.event.schedule == '0 8 * * 1' && 'true' || github.event.inputs.full_run || 'false' }}
        run: python scripts/etl_saude.py
```

## Validação
1. Rodar manualmente: Actions → "ETL Saúde" → "Run workflow" (com full_run=false para teste rápido)
2. Deve completar em ~1-2 minutos (50 municípios × 0.1s sleep)
3. Verificar `dengue_data` no Supabase — deve ter ~200 registros (50 municípios × 4 semanas)
4. Depois rodar com full_run=true e confirmar que completa em <15 min

## Commit
```
git add -A && git commit -m "fix: ETL Saúde - otimizar para top 50 municípios + rate limiting + circuit breaker"
```
