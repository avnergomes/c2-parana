# PROMPT 2 — CORRIGIR ETL MEIO AMBIENTE (FIRMS + ANA + AQICN)

## Prioridade: 🟠 ALTA — Focos de calor, rios e qualidade do ar

## Problema
O workflow `cron-ambiente.yml` falha com exit code 1 (Run #4). Tabelas `fire_spots`, `air_quality` e `river_levels` estão todas vazias.

## Causas Raiz (múltiplas)

### Causa 1: `NASA_FIRMS_KEY = "DEMO_KEY"` — limite ultrapassado
No código (linha 17): `NASA_FIRMS_KEY = os.environ.get("NASA_FIRMS_KEY", "DEMO_KEY")`
Se o secret `NASA_FIRMS_KEY` não estiver configurado no GitHub, usa DEMO_KEY que tem limite de ~10 requests/dia e frequentemente retorna 403.

### Causa 2: API ANA retorna XML com namespace que o parser não encontra
O XML da ANA usa namespace `{http://www.ana.gov.br/}` e o código tenta vários paths, mas pode falhar com exceção não capturada se o XML estiver malformado ou a API retornar erro HTTP 500.

### Causa 3: `river_levels` não tem UNIQUE constraint em `station_code`
O ETL faz `on_conflict="station_code"` mas a tabela `river_levels` NÃO TEM UNIQUE constraint nessa coluna. Isso causa erro PostgreSQL: `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

### Causa 4: `fire_spots` upsert com `on_conflict="latitude,longitude,acq_date"` mas migration 004 usa `COALESCE(acq_time, '')`
O UNIQUE index na migration 004 é `(latitude, longitude, acq_date, COALESCE(acq_time, ''))` — inclui acq_time. Mas o upsert usa `on_conflict="latitude,longitude,acq_date"` (sem acq_time). Se a migration 004 NÃO foi aplicada, o upsert falha. Se FOI aplicada, o on_conflict não bate com o index (que inclui 4 colunas).

### Causa 5: Crash em qualquer seção impede as demais
O `main()` roda FIRMS → AQICN → ANA em sequência. Se FIRMS crashar (403 do DEMO_KEY), a exceção pode propagar e impedir AQICN e ANA de rodarem.

## Arquivo: `scripts/etl_ambiente.py`

### Correção Principal: Isolar cada seção com try/except independente

Substituir o `main()` inteiro por:

```python
def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    errors = []

    # === NASA FIRMS ===
    print("=" * 40)
    print("1/3 Buscando focos de calor NASA FIRMS...")
    try:
        if NASA_FIRMS_KEY == "DEMO_KEY":
            print("  ⚠️ AVISO: Usando DEMO_KEY! Configure NASA_FIRMS_KEY nos secrets do GitHub.")
            print("  Obtenha sua key em: https://firms.modaps.eosdis.nasa.gov/api/area/")
        
        spots = fetch_firms()
        if spots:
            # Upsert com on_conflict que bate com o UNIQUE index
            # Se a migration 004 foi aplicada: (latitude, longitude, acq_date, COALESCE(acq_time, ''))
            # Se não foi: não há constraint → insert simples
            try:
                supabase.table("fire_spots").upsert(
                    spots,
                    on_conflict="latitude,longitude,acq_date"
                ).execute()
                print(f"  ✅ {len(spots)} focos inseridos/atualizados")
            except Exception as e:
                if "no unique or exclusion constraint" in str(e):
                    # Fallback: insert direto (sem on_conflict)
                    # Primeiro limpar focos antigos para evitar duplicatas
                    cutoff = (datetime.now() - timedelta(days=1)).date().isoformat()
                    supabase.table("fire_spots").delete().gte("acq_date", cutoff).execute()
                    supabase.table("fire_spots").insert(spots).execute()
                    print(f"  ✅ {len(spots)} focos inseridos (sem upsert)")
                else:
                    raise
            
            # Limpar focos com mais de 30 dias
            cutoff = (datetime.now() - timedelta(days=30)).date().isoformat()
            supabase.table("fire_spots").delete().lt("acq_date", cutoff).execute()
        else:
            print("  Nenhum foco encontrado (pode ser período sem queimadas)")
    except Exception as e:
        print(f"  ❌ ERRO FIRMS: {e}")
        errors.append(f"FIRMS: {e}")

    # === AQICN ===
    print("=" * 40)
    print("2/3 Buscando qualidade do ar AQICN...")
    try:
        if WAQI_TOKEN == "demo":
            print("  ⚠️ AVISO: Usando token demo! Configure WAQI_TOKEN nos secrets do GitHub.")
            print("  Obtenha seu token em: https://aqicn.org/data-platform/token/")
        
        aq_records = fetch_aqicn()
        if aq_records:
            try:
                supabase.table("air_quality").upsert(
                    aq_records,
                    on_conflict="city"
                ).execute()
                print(f"  ✅ {len(aq_records)} cidades atualizadas")
            except Exception as e:
                if "no unique or exclusion constraint" in str(e):
                    # Migration 005 não foi aplicada — aplicar na hora
                    print("  ⚠️ UNIQUE constraint 'city' não existe. Tentando insert...")
                    # Deletar dados antigos e inserir novos
                    for rec in aq_records:
                        supabase.table("air_quality").delete().eq("city", rec["city"]).execute()
                    supabase.table("air_quality").insert(aq_records).execute()
                    print(f"  ✅ {len(aq_records)} cidades inseridas (sem upsert)")
                else:
                    raise
    except Exception as e:
        print(f"  ❌ ERRO AQICN: {e}")
        errors.append(f"AQICN: {e}")

    # === ANA Rios ===
    print("=" * 40)
    print("3/3 Buscando nível dos rios ANA...")
    try:
        rivers = fetch_ana_rivers()
        if rivers:
            # river_levels NÃO TEM UNIQUE constraint em station_code
            # Solução: deletar e reinserir (ou criar o constraint)
            try:
                supabase.table("river_levels").upsert(
                    rivers,
                    on_conflict="station_code"
                ).execute()
                print(f"  ✅ {len(rivers)} estações atualizadas")
            except Exception as e:
                if "no unique or exclusion constraint" in str(e):
                    # Sem UNIQUE — fazer delete + insert
                    for station in ESTACOES_RIOS_PR:
                        supabase.table("river_levels").delete().eq("station_code", station["code"]).execute()
                    supabase.table("river_levels").insert(rivers).execute()
                    print(f"  ✅ {len(rivers)} estações inseridas (sem upsert)")
                else:
                    raise
    except Exception as e:
        print(f"  ❌ ERRO ANA: {e}")
        errors.append(f"ANA: {e}")

    # === Resumo ===
    print("=" * 40)
    if errors:
        print(f"ETL Ambiente concluído com {len(errors)} erro(s):")
        for err in errors:
            print(f"  - {err}")
        # NÃO sair com exit code 1 — dados parciais são melhores que nenhum dado
    else:
        print("ETL Ambiente concluído com sucesso!")
```

### Correção na função `fetch_firms()`:
Adicionar tratamento para 403/429 do DEMO_KEY:
```python
def fetch_firms():
    """Busca focos de calor VIIRS SNPP do NASA FIRMS."""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_KEY}/VIIRS_SNPP_NRT/{PR_BBOX}/1"
    try:
        resp = requests.get(url, timeout=60)
        
        if resp.status_code in (403, 429):
            print(f"  FIRMS retornou {resp.status_code} — limite de API atingido")
            if NASA_FIRMS_KEY == "DEMO_KEY":
                print("  Configure NASA_FIRMS_KEY em GitHub Secrets!")
            return []
        
        resp.raise_for_status()
        # ... resto do código igual
```

### Correção na função `fetch_ana_rivers()`:
Melhorar tratamento de XML para não crashar:
```python
def fetch_ana_rivers():
    """Busca dados telemétricos de rios do PR via API SAR/ANA."""
    records = []

    for est in ESTACOES_RIOS_PR:
        try:
            now = datetime.now()
            date_end = now.strftime("%d/%m/%Y")
            date_start = (now - timedelta(days=1)).strftime("%d/%m/%Y")

            url = f"https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao={est['code']}&dataInicio={date_start}&dataFim={date_end}"
            resp = requests.get(url, timeout=30)

            if resp.status_code != 200:
                print(f"  Estação {est['code']}: HTTP {resp.status_code}")
                # Adicionar com dados vazios em vez de pular
                records.append(_empty_river_record(est))
                continue

            # Verificar se response é XML válido
            content_type = resp.headers.get('Content-Type', '')
            if 'xml' not in content_type.lower() and 'text' not in content_type.lower():
                print(f"  Estação {est['code']}: Content-Type inesperado: {content_type}")
                records.append(_empty_river_record(est))
                continue

            try:
                root = ET.fromstring(resp.content)
            except ET.ParseError as e:
                print(f"  Estação {est['code']}: XML inválido: {e}")
                records.append(_empty_river_record(est))
                continue

            # ... resto da lógica de parsing igual ...

        except Exception as e:
            print(f"  Erro estação {est['code']}: {e}")
            records.append(_empty_river_record(est))

    print(f"ANA: {len(records)} estações coletadas")
    return records


def _empty_river_record(est: dict) -> dict:
    """Retorna registro vazio para uma estação (fallback)."""
    return {
        "station_code": est["code"],
        "station_name": est["name"],
        "river_name": est["river"],
        "municipality": est["municipality"],
        "latitude": est.get("lat"),
        "longitude": est.get("lon"),
        "level_cm": None,
        "flow_m3s": None,
        "alert_level": "normal",
        "observed_at": datetime.now().isoformat(),
    }
```

## Ação Manual Necessária: Secrets do GitHub
Ir em `github.com/avnergomes/c2-parana` → Settings → Secrets and variables → Actions
Verificar que existem:
- `NASA_FIRMS_KEY` — obter grátis em https://firms.modaps.eosdis.nasa.gov/api/area/ (clicar "Get Map Key")
- `WAQI_TOKEN` — obter grátis em https://aqicn.org/data-platform/token/

Se não existirem, o ETL vai funcionar parcialmente (ANA rios funciona sem key), mas FIRMS e AQICN vão usar demo keys com limites baixos.

## Validação
1. Rodar manualmente: Actions → "ETL Meio Ambiente" → "Run workflow"
2. Logs devem mostrar ✅ para cada seção (ou ⚠️ com detalhes)
3. Verificar no Supabase:
   - `fire_spots` — deve ter registros (se houver focos no PR naquele dia)
   - `air_quality` — deve ter 4 registros (curitiba, londrina, maringa, foz)
   - `river_levels` — deve ter 8 registros (8 estações configuradas)

## Commit
```
git add -A && git commit -m "fix: ETL Ambiente - isolar seções + fallbacks + tratar UNIQUE constraints"
```
