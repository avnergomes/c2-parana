# PROMPT 1 — CORRIGIR ETL CLIMA (INMET)

## Prioridade: 🟠 ALTA — Dados meteorológicos são o coração do sistema

## Problema
O workflow `cron-clima.yml` roda a cada hora com sucesso (exit code 0), mas a tabela `climate_data` no Supabase tem **0 registros**. O ETL completa sem erro porque cai no branch `print("Nenhum dado de clima para inserir")`.

## Causa Raiz Provável
Após análise do código, existem 3 hipóteses (verificar na ordem):

### Hipótese 1: API INMET retornando lista vazia ou JSON inválido
A URL `https://apitempo.inmet.gov.br/estacao/dados/{code}/{date_ini}/{date_fim}` pode estar retornando `[]` ou um formato diferente do esperado.

### Hipótese 2: Todos os registros têm `temperature = None`
Na linha 146: `if parsed and parsed.get("temperature") is not None:` — se TODOS os campos TEM_INS vierem como `None`, `""` ou `"-9999"`, nenhum registro passa o filtro.

### Hipótese 3: Horário UTC vs BRT
O cron roda em UTC. `datetime.now()` no GitHub Actions retorna UTC. Se `date_ini` e `date_fim` são ambos "2026-03-01" (UTC) mas as medições mais recentes da INMET estão com data BRT (que pode ser "2026-03-02" à noite), os dados não serão encontrados.

## Arquivo: `scripts/etl_clima.py`

### Correção 1: Adicionar logging detalhado para diagnóstico
Na função `fetch_station_data`, ANTES do `return`:
```python
def fetch_station_data(station_code: str, date_ini: str, date_fim: str) -> list:
    """Busca dados de uma estação INMET."""
    url = f"https://apitempo.inmet.gov.br/estacao/dados/{station_code}/{date_ini}/{date_fim}"
    try:
        response = requests.get(url, timeout=30)
        print(f"  HTTP {response.status_code} | Content-Length: {len(response.content)} bytes")
        response.raise_for_status()
        data = response.json()
        
        if isinstance(data, list):
            print(f"  Registros retornados: {len(data)}")
            if data:
                # Log do primeiro registro para debug
                sample = data[-1]
                print(f"  Último registro: DT={sample.get('DT_MEDICAO')} HR={sample.get('HR_MEDICAO')} TEM={sample.get('TEM_INS')} UMD={sample.get('UMD_INS')}")
            return data
        else:
            print(f"  Resposta não é lista: {type(data)} | {str(data)[:200]}")
            return []
    except requests.exceptions.HTTPError as e:
        print(f"  HTTP Error estação {station_code}: {e}")
        print(f"  Response body: {response.text[:500]}")
        return []
    except Exception as e:
        print(f"  Erro na estação {station_code}: {e}")
        return []
```

### Correção 2: Ampliar janela de datas para cobrir fuso horário
Na função `main()`, mudar de 6 horas para 2 dias de janela:
```python
def main():
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    now = datetime.now()
    # Usar janela de 2 dias para cobrir diferenças UTC/BRT
    date_fim = now.strftime("%Y-%m-%d")
    date_ini = (now - timedelta(days=2)).strftime("%Y-%m-%d")

    print(f"Buscando dados INMET: {date_ini} a {date_fim}")
    print(f"Timestamp atual (UTC no Actions): {now.isoformat()}")
```

### Correção 3: Relaxar filtro de temperatura
Manter registros mesmo se `temperature` for None (pode haver humidity/wind/rain):
```python
        for record in raw_data[-6:]:  # últimas 6 medições (era 2, ampliar para ter mais chances)
            parsed = parse_station_record(record, station_code, meta)
            if parsed:
                # Aceitar registro se tiver qualquer dado útil
                has_data = any([
                    parsed.get("temperature") is not None,
                    parsed.get("humidity") is not None,
                    parsed.get("wind_speed") is not None,
                    parsed.get("precipitation") is not None,
                ])
                if has_data:
                    all_records.append(parsed)
```

### Correção 4: Tratar resposta HTML/erro da API INMET
A API INMET às vezes retorna HTML em vez de JSON (página de manutenção). Adicionar check:
```python
        response.raise_for_status()
        
        # INMET às vezes retorna HTML em vez de JSON
        content_type = response.headers.get('Content-Type', '')
        if 'text/html' in content_type:
            print(f"  INMET retornou HTML (manutenção?) para {station_code}")
            return []
        
        data = response.json()
```

### Correção 5: Log final antes do upsert
```python
    print(f"Total de registros válidos: {len(all_records)}")
    if all_records:
        print(f"  Amostra: station={all_records[0]['station_code']} temp={all_records[0]['temperature']} at={all_records[0]['observed_at']}")
        try:
            result = supabase.table("climate_data").upsert(
                all_records,
                on_conflict="station_code,observed_at"
            ).execute()
            print(f"Inseridos/atualizados: {len(all_records)} registros de clima")
            print(f"Supabase response status: {result}")
        except Exception as e:
            print(f"ERRO no upsert Supabase: {e}")
            # Tentar inserir um por um para identificar o registro problemático
            for rec in all_records[:3]:
                try:
                    supabase.table("climate_data").upsert(
                        [rec], on_conflict="station_code,observed_at"
                    ).execute()
                    print(f"  OK: {rec['station_code']} {rec['observed_at']}")
                except Exception as e2:
                    print(f"  FALHA: {rec['station_code']} → {e2}")
```

## Verificação após deploy
1. Rodar manualmente o workflow no GitHub: Actions → "ETL Clima (INMET)" → "Run workflow"
2. Verificar os logs do Actions — deve mostrar registros por estação
3. Conferir no Supabase Dashboard → Table Editor → `climate_data` — deve ter registros
4. Se ainda 0 registros, os logs vão mostrar exatamente onde o problema está (API retornando vazio, dados com temp=None, erro no upsert, etc.)

## Commit
```
git add -A && git commit -m "fix: ETL Clima - adicionar diagnóstico detalhado + ampliar janela temporal"
```
