# PROMPT 01 — [CRÍTICO] Criar ETL Agro (etl_agro.py + cron)

## Contexto
O módulo Agronegócio é módulo Pro (premium, R$149/mês) mas está completamente inoperante. Os hooks em `src/hooks/useAgro.ts` consultam a tabela `data_cache` com as chaves:
- `vbp_kpis_pr` — KPIs do Valor Bruto da Produção
- `vbp_municipios_pr` — VBP por município
- `comex_kpis_pr` — KPIs de comércio exterior
- `emprego_agro_pr` — Dados de emprego agropecuário
- `credito_rural_pr` — Dados de crédito rural

Nenhuma dessas chaves é populada por nenhum ETL. Resultado: todos os KPIs de agro exibem `—` em produção.

Além disso, a tab ComexStat na `AgroPage.tsx` redireciona para um link externo (`avnergomes.github.io/comexstat-parana`) ao invés de exibir dados integrados.

## Tarefa

### 1. Criar `scripts/etl_agro.py`

Script Python que popula `data_cache` com dados reais das seguintes fontes públicas:

#### 1.1 VBP — Valor Bruto da Produção (IBGE SIDRA)
- **API**: `https://apisidra.ibge.gov.br/values/t/5457/n6/all/v/allxp/p/last%201/c782/allxt/d/v214%202`
  - Tabela 5457 = Produção Agrícola Municipal (PAM)
  - `n6/all` = todos os municípios
  - Filtrar pelo Paraná (UF=41) no código do município (começa com 41)
- **Alternativa mais simples**: usar a tabela SIDRA 1612 (Quantidade Produzida) como proxy
- Popular as chaves:
  - `vbp_kpis_pr`: `{ vbp_total_brl, vbp_lavoura_brl, vbp_pecuaria_brl, variacao_yoy, ano_referencia }`
  - `vbp_municipios_pr`: array de `{ ibge_code, nome, vbp_total, vbp_lavoura, vbp_pecuaria }`

#### 1.2 ComexStat — Comércio Exterior (MDIC API)
- **API**: `https://api-comexstat.mdic.gov.br/general`
  - Endpoint público sem autenticação
  - Documentação: https://api-comexstat.mdic.gov.br/swagger
- **Payload** para exportações do PR:
```json
{
  "flow": "export",
  "monthDetail": true,
  "period": { "from": "YYYYMM", "to": "YYYYMM" },
  "filters": [{ "id": "state", "values": ["41"] }],
  "details": [],
  "metrics": ["metricFOB"]
}
```
- Similar para importações com `"flow": "import"`
- Popular `comex_kpis_pr`: `{ exportacoes_usd, importacoes_usd, saldo_usd, variacao_export_yoy, mes_referencia }`

#### 1.3 Emprego Agro — CAGED/PDET via IBGE SIDRA
- **API alternativa mais acessível**: IBGE SIDRA tabela 6381 (CAGED) ou tabela 4092 (pessoas ocupadas)
- Se CAGED não for acessível via SIDRA, usar dados do Cadastro Central de Empresas (CEMPRE) tabela 6450
- Popular `emprego_agro_pr`: `{ estoque_atual, saldo_mes, variacao_yoy, serie: [{ ano_mes, saldo, estoque }] }`

#### 1.4 Crédito Rural — BACEN/SNCR
- **API**: `https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/`
  - Endpoint público do SICOR (Sistema de Operações do Crédito Rural)
  - Documentação: https://dadosabertos.bcb.gov.br/dataset/sicor
- Filtrar por UF=PR, agrupar por mês
- Popular `credito_rural_pr`: `{ total_ano_brl, num_contratos, variacao_yoy, serie: [{ ano_mes, valor }] }`

#### 1.5 Leitos SUS — CNES/DataSUS
- **API**: `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos`
  - Alternativa: usar tabnet CNES via scraping simples ou dados estáticos
- Popular `leitos_sus_pr`: `{ total_leitos, leitos_uti, ocupacao_uti_pct, data_referencia }`

### Estrutura do script:
```python
#!/usr/bin/env python3
"""ETL Agro: VBP + ComexStat + Emprego + Crédito Rural + Leitos SUS."""

import os, json, requests
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def upsert_cache(supabase, cache_key: str, data: dict, source: str):
    """Upsert no data_cache com timestamp atualizado."""
    supabase.table("data_cache").upsert({
        "cache_key": cache_key,
        "data": json.dumps(data) if not isinstance(data, str) else data,
        "source": source,
        "fetched_at": datetime.now().isoformat(),
    }, on_conflict="cache_key").execute()

def fetch_vbp_sidra():
    """Busca VBP do IBGE SIDRA."""
    # Implementar...

def fetch_comexstat():
    """Busca dados ComexStat do MDIC."""
    # Implementar...

def fetch_emprego_agro():
    """Busca dados de emprego agropecuário."""
    # Implementar...

def fetch_credito_rural():
    """Busca dados SICOR/BACEN."""
    # Implementar...

def fetch_leitos_sus():
    """Busca dados de leitos SUS do CNES."""
    # Implementar...

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print("=== ETL Agro ===")
    
    # VBP
    print("1/5 Buscando VBP SIDRA...")
    vbp_kpis, vbp_municipios = fetch_vbp_sidra()
    if vbp_kpis:
        upsert_cache(supabase, "vbp_kpis_pr", vbp_kpis, "ibge_sidra")
    if vbp_municipios:
        upsert_cache(supabase, "vbp_municipios_pr", vbp_municipios, "ibge_sidra")
    
    # ComexStat
    print("2/5 Buscando ComexStat MDIC...")
    comex = fetch_comexstat()
    if comex:
        upsert_cache(supabase, "comex_kpis_pr", comex, "mdic_comexstat")
    
    # Emprego
    print("3/5 Buscando emprego agro...")
    emprego = fetch_emprego_agro()
    if emprego:
        upsert_cache(supabase, "emprego_agro_pr", emprego, "ibge_cempre")
    
    # Crédito Rural
    print("4/5 Buscando crédito rural SICOR...")
    credito = fetch_credito_rural()
    if credito:
        upsert_cache(supabase, "credito_rural_pr", credito, "bcb_sicor")
    
    # Leitos SUS
    print("5/5 Buscando leitos SUS...")
    leitos = fetch_leitos_sus()
    if leitos:
        upsert_cache(supabase, "leitos_sus_pr", leitos, "datasus_cnes")
    
    print("ETL Agro concluído!")

if __name__ == "__main__":
    main()
```

### 2. Criar `.github/workflows/cron-agro.yml`
```yaml
name: ETL Agro (VBP + ComexStat + Crédito)

on:
  schedule:
    - cron: '0 8 * * 1'   # Toda segunda-feira às 8h UTC (5h BRT)
  workflow_dispatch:

jobs:
  etl-agro:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Instalar dependências
        run: pip install -r scripts/requirements.txt

      - name: Executar ETL Agro
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python scripts/etl_agro.py
```

Frequência semanal porque VBP/ComexStat/CAGED são dados mensais que mudam lentamente.

### 3. Atualizar `package.json`
Adicionar script: `"etl:agro": "cd scripts && python etl_agro.py"`

### 4. Atualizar `scripts/requirements.txt`
Garantir que `requests` e `supabase` estejam listados (já devem estar).

### 5. Substituir link externo do ComexStat na AgroPage

No arquivo `src/pages/AgroPage.tsx`, a tab `comex` atualmente mostra apenas um link para `avnergomes.github.io/comexstat-parana`. Substituir por um componente que exibe os KPIs do `comex_kpis_pr` do `data_cache`, usando o hook `useComexKpis()` que já existe em `useAgro.ts`.

Exemplo de substituição na tab comex:
```tsx
{activeTab === 'comex' && (
  <div className="space-y-4">
    {comexKpis ? (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Exportações" value={formatCurrency(comexKpis.exportacoes_usd, 'USD')} accentColor="green" />
        <KpiCard label="Importações" value={formatCurrency(comexKpis.importacoes_usd, 'USD')} accentColor="blue" />
        <KpiCard label="Saldo Comercial" value={formatCurrency(comexKpis.saldo_usd, 'USD')} accentColor={comexKpis.saldo_usd > 0 ? 'green' : 'red'} />
        <KpiCard label="Variação Export. YoY" value={`${comexKpis.variacao_export_yoy > 0 ? '+' : ''}${comexKpis.variacao_export_yoy.toFixed(1)}%`} accentColor={comexKpis.variacao_export_yoy > 0 ? 'green' : 'red'} />
      </div>
    ) : (
      <EmptyState message="Dados ComexStat não disponíveis. Execute o ETL Agro." />
    )}
    <p className="text-text-muted text-xs">
      Fonte: MDIC ComexStat · Ref: {comexKpis?.mes_referencia || '—'}
    </p>
  </div>
)}
```

## Critério de Sucesso
- [ ] `scripts/etl_agro.py` existe e roda sem erros (pode usar `workflow_dispatch` para testar)
- [ ] Todas as 5 chaves do `data_cache` são populadas com dados reais do Paraná
- [ ] `.github/workflows/cron-agro.yml` existe com schedule semanal
- [ ] Tab ComexStat na AgroPage exibe KPIs do `data_cache` em vez de link externo
- [ ] `package.json` tem script `etl:agro`

## Fontes de Referência
- IBGE SIDRA API: https://apisidra.ibge.gov.br/
- MDIC ComexStat API: https://api-comexstat.mdic.gov.br/swagger
- BACEN SICOR: https://dadosabertos.bcb.gov.br/dataset/sicor
- DataSUS CNES: https://apidadosabertos.saude.gov.br/
