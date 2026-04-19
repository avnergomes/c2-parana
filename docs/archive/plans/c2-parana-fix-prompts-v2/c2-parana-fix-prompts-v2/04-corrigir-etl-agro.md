# PROMPT 4 — CORRIGIR ETL AGRO (VBP + ComexStat + Crédito Rural)

## Prioridade: 🟡 MÉDIA — Nunca rodou, mas tem fallbacks

## Problema
O workflow `cron-agro.yml` nunca executou porque o cron é `0 8 * * 1` (segunda-feira 8h UTC) e o repo foi deployado recentemente — nunca chegou uma segunda-feira desde o deploy. A tabela `data_cache` tem 0 registros.

## Causa Raiz
Não é um bug no código — apenas nunca foi triggered. Porém, existem riscos no código que precisam ser mitigados ANTES de rodar:

### Risco 1: API SIDRA muito lenta
A URL `https://apisidra.ibge.gov.br/values/t/5457/n6/all/v/214/p/last%201/c782/0` pede TODOS os municípios do Brasil (n6/all). Isso pode ser muito lento ou retornar payload enorme.

### Risco 2: API ComexStat com payload POST
A API ComexStat (`api-comexstat.mdic.gov.br/general`) usa POST com JSON body. Se a API mudar o schema do request, vai falhar silenciosamente e cair no fallback.

### Risco 3: API SICOR do BACEN lenta/instável
A URL `olinda.bcb.gov.br/olinda/servico/SICOR/...` é notoriamente lenta e pode dar timeout em 60s.

### Risco 4: `upsert_cache` usando `data` como JSONB
O campo `data` na tabela `data_cache` é JSONB. Se `vbp_municipios` for uma lista (não um dict), o upsert precisa envolver em `{"items": list}`.

## Arquivo: `scripts/etl_agro.py`

### Correção 1: Proteger SIDRA com timeout mais generoso + filtro PR direto
```python
def fetch_vbp_sidra():
    """Busca VBP do IBGE SIDRA - Produção Agrícola Municipal."""
    try:
        # Filtrar apenas Paraná na query SIDRA (n6/4106902 é Curitiba, mas n3/41 é estado PR)
        # Usar tabela por estado é mais eficiente que todos os municípios
        url = "https://apisidra.ibge.gov.br/values/t/5457/n3/41/v/214/p/last%201/c782/0"
        resp = requests.get(url, timeout=90)  # Timeout generoso
        # ... resto igual
```

**Nota**: Mudar `n6/all` para `n3/41` pega o total do Paraná direto, evitando carregar todos os municípios do Brasil.

### Correção 2: Envolver listas em dict para JSONB
```python
def upsert_cache(supabase, cache_key: str, data, source: str):
    """Upsert no data_cache com timestamp atualizado."""
    # Se data for lista, envolver em dict para JSONB compatibilidade
    if isinstance(data, list):
        data = {"items": data}
    
    supabase.table("data_cache").upsert({
        "cache_key": cache_key,
        "data": data,
        "source": source,
        "fetched_at": datetime.now().isoformat(),
    }, on_conflict="cache_key").execute()
```

### Correção 3: Isolar cada fonte com try/except
```python
def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print("=== ETL Agro ===")
    results = {}

    # VBP
    print("1/4 Buscando VBP SIDRA...")
    try:
        vbp_kpis, vbp_municipios = fetch_vbp_sidra()
        if vbp_kpis:
            upsert_cache(supabase, "vbp_kpis_pr", vbp_kpis, "ibge_sidra")
            results["vbp"] = "✅"
            print(f"  VBP Total: R$ {vbp_kpis['vbp_total_brl']:,.0f}")
        if vbp_municipios:
            upsert_cache(supabase, "vbp_municipios_pr", vbp_municipios, "ibge_sidra")
            print(f"  {len(vbp_municipios)} municípios salvos")
    except Exception as e:
        print(f"  ❌ Erro VBP: {e}")
        results["vbp"] = f"❌ {e}"

    # ComexStat
    print("2/4 Buscando ComexStat MDIC...")
    try:
        comex = fetch_comexstat()
        if comex:
            upsert_cache(supabase, "comex_kpis_pr", comex, "mdic_comexstat")
            results["comex"] = "✅"
            print(f"  Exportações: US$ {comex['exportacoes_usd']:,.0f}")
    except Exception as e:
        print(f"  ❌ Erro ComexStat: {e}")
        results["comex"] = f"❌ {e}"

    # Emprego
    print("3/4 Buscando emprego agro...")
    try:
        emprego = fetch_emprego_agro()
        if emprego:
            upsert_cache(supabase, "emprego_agro_pr", emprego, "ibge_cempre")
            results["emprego"] = "✅"
            print(f"  Estoque: {emprego['estoque_atual']:,} pessoas")
    except Exception as e:
        print(f"  ❌ Erro emprego: {e}")
        results["emprego"] = f"❌ {e}"

    # Crédito Rural
    print("4/4 Buscando crédito rural SICOR...")
    try:
        credito = fetch_credito_rural()
        if credito:
            upsert_cache(supabase, "credito_rural_pr", credito, "bcb_sicor")
            results["credito"] = "✅"
            print(f"  Crédito: R$ {credito['total_ano_brl']:,.0f}")
    except Exception as e:
        print(f"  ❌ Erro SICOR: {e}")
        results["credito"] = f"❌ {e}"

    # Resumo
    print("\n=== Resumo ETL Agro ===")
    for k, v in results.items():
        print(f"  {k}: {v}")
    print("ETL Agro concluído!")
```

### Correção 4: Melhorar `fetch_comexstat` para tratar resposta não-padrão
```python
def fetch_comexstat():
    """Busca dados ComexStat do MDIC."""
    try:
        # ... (payload igual) ...
        
        resp_exp = requests.post(url, json=export_payload, timeout=30,
                                  headers={"Content-Type": "application/json"})
        
        # Log para debug
        print(f"  ComexStat export HTTP {resp_exp.status_code}")
        
        if resp_exp.status_code != 200:
            print(f"  ComexStat response: {resp_exp.text[:300]}")
            return get_comex_fallback()
        
        # ... resto igual ...
```

## Ação Manual: Disparar workflow
1. Ir em `github.com/avnergomes/c2-parana` → Actions → "ETL Agro" → "Run workflow" → botão verde
2. Monitorar os logs

## Validação
1. Após rodar, verificar no Supabase → `data_cache` → devem existir 5 registros:
   - `vbp_kpis_pr`
   - `vbp_municipios_pr`
   - `comex_kpis_pr`
   - `emprego_agro_pr`
   - `credito_rural_pr`
2. Se algum falhar (API offline), deve ter dados dos fallbacks

## Commit
```
git add -A && git commit -m "fix: ETL Agro - isolar fontes + tratar JSONB + proteger timeouts"
```
