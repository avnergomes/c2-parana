# PROMPT 02 — [CRÍTICO] Substituir Endpoint ANA Telemetria

## Contexto
O arquivo `scripts/etl_ambiente.py` (função `fetch_ana_rivers()`, linha 93-125) usa o endpoint:
```
https://www.ana.gov.br/ANA_Telemetrica/api/estacoes?codEstado=41
```

Este endpoint é uma API não-oficial que a ANA descontinuou. Resultado:
- O módulo Meio Ambiente nunca tem dados de rios reais
- `flow_m3s` é sempre `None` (hardcoded na linha 114)
- `alert_level` é sempre `"normal"` (hardcoded na linha 115)
- O KPI "Rios em alerta" na `AmbientePage.tsx` é sempre 0

## Tarefa

### 1. Substituir `fetch_ana_rivers()` em `scripts/etl_ambiente.py`

Usar a API pública do **SNIRHweb / HidroWeb** da ANA que está ativa:

#### Opção A — API Telemetria SAR (recomendada)
```
https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos
```
- Parâmetros: `codEstacao={codigo}&dataInicio={dd/MM/yyyy}&dataFim={dd/MM/yyyy}`
- Retorna XML com dados de nível e vazão
- Estações fluviométricas do PR podem ser listadas via:
  ```
  https://telemetriaws1.ana.gov.br/ServiceANA.asmx/ListaEstacoesTelemetricas
  ```
  - Filtrar por `codEstado=41` no XML retornado

#### Opção B — HidroWeb API REST (alternativa)
```
https://www.snirh.gov.br/hidroweb/rest/api/documento/convencionais
```
- Parâmetros: `tipo=2&estado=41&subBacia=&bacia=` (tipo 2 = fluviométrica)

#### Opção C — API Dados Abertos ANA via OData
```
https://www.ana.gov.br/dadosabertos/odata/v4/EstacoesTelemetricas?$filter=CodEstado eq '41'&$top=50
```

### Implementação recomendada (Opção A):

```python
import xml.etree.ElementTree as ET

# Estações fluviométricas principais do PR (hardcoded para confiabilidade)
ESTACOES_RIOS_PR = [
    {"code": "65017006", "name": "Porto Amazonas", "river": "Rio Iguaçu", "municipality": "Porto Amazonas"},
    {"code": "65310000", "name": "União da Vitória", "river": "Rio Iguaçu", "municipality": "União da Vitória"},
    {"code": "64507000", "name": "Porto São José", "river": "Rio Paraná", "municipality": "São Pedro do Paraná"},
    {"code": "64620000", "name": "Salto Caxias", "river": "Rio Iguaçu", "municipality": "Capitão Leônidas Marques"},
    {"code": "64390000", "name": "Guaíra", "river": "Rio Paraná", "municipality": "Guaíra"},
    {"code": "65035000", "name": "São José dos Pinhais", "river": "Rio Iguaçu", "municipality": "São José dos Pinhais"},
    {"code": "64693000", "name": "Foz do Iguaçu", "river": "Rio Iguaçu", "municipality": "Foz do Iguaçu"},
    {"code": "65155000", "name": "São Mateus do Sul", "river": "Rio Iguaçu", "municipality": "São Mateus do Sul"},
    {"code": "64442800", "name": "Maringá", "river": "Rio Ivaí", "municipality": "Maringá"},
    {"code": "64475000", "name": "Londrina", "river": "Rio Tibagi", "municipality": "Londrina"},
]

# Cotas de alerta por estação (em cm) — valores de referência SIMEPAR/ANA
# Se não disponíveis, usar heurística: normal < 200cm, attention 200-400, alert 400-600, emergency > 600
COTAS_ALERTA = {
    "65017006": {"attention": 300, "alert": 450, "emergency": 600},
    "65310000": {"attention": 500, "alert": 700, "emergency": 900},
    # ... definir para cada estação ou usar heurística padrão
}

def get_alert_level(station_code: str, level_cm: float) -> str:
    """Calcula nível de alerta baseado na cota."""
    if level_cm is None:
        return "normal"
    cotas = COTAS_ALERTA.get(station_code, {"attention": 200, "alert": 400, "emergency": 600})
    if level_cm >= cotas["emergency"]:
        return "emergency"
    elif level_cm >= cotas["alert"]:
        return "alert"
    elif level_cm >= cotas["attention"]:
        return "attention"
    return "normal"

def fetch_ana_rivers():
    """Busca dados telemétricos de rios do PR via API SAR/ANA."""
    records = []
    
    for est in ESTACOES_RIOS_PR:
        try:
            # Buscar dados das últimas 24h
            now = datetime.now()
            date_end = now.strftime("%d/%m/%Y")
            date_start = (now - timedelta(days=1)).strftime("%d/%m/%Y")
            
            url = f"https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao={est['code']}&dataInicio={date_start}&dataFim={date_end}"
            resp = requests.get(url, timeout=30)
            
            if resp.status_code != 200:
                continue
            
            # Parse XML
            root = ET.fromstring(resp.content)
            # Namespace pode variar — tentar sem namespace
            dados = root.findall('.//DadosHidrometereologicos') or root.findall('.//{*}DadosHidrometereologicos')
            
            if not dados:
                continue
            
            # Pegar último registro (mais recente)
            ultimo = dados[-1]
            nivel = ultimo.findtext('Nivel') or ultimo.findtext('{*}Nivel')
            vazao = ultimo.findtext('Vazao') or ultimo.findtext('{*}Vazao')
            data_hora = ultimo.findtext('DataHora') or ultimo.findtext('{*}DataHora')
            
            level_cm = float(nivel) if nivel and nivel.strip() else None
            flow_m3s = float(vazao) if vazao and vazao.strip() else None
            
            records.append({
                "station_code": est["code"],
                "station_name": est["name"],
                "river_name": est["river"],
                "municipality": est["municipality"],
                "latitude": None,  # Pode ser preenchido depois
                "longitude": None,
                "level_cm": level_cm,
                "flow_m3s": flow_m3s,
                "alert_level": get_alert_level(est["code"], level_cm),
                "observed_at": data_hora or now.isoformat(),
            })
            
        except Exception as e:
            print(f"  Erro estação {est['code']}: {e}")
            continue
    
    print(f"ANA: {len(records)} estações coletadas")
    return records
```

### 2. Adicionar import de `xml.etree.ElementTree`
No topo do `etl_ambiente.py`, adicionar:
```python
import xml.etree.ElementTree as ET
```

### 3. Manter o fallback
Se a API SAR estiver indisponível, manter um print de aviso mas não quebrar o ETL inteiro. Os dados de FIRMS e AQICN devem continuar independentes.

### 4. Verificar se funciona
Após implementar, rodar localmente ou via `workflow_dispatch` no GitHub Actions e verificar:
- Que `river_levels` é populado com dados reais
- Que `level_cm` tem valores numéricos (não null)
- Que `alert_level` é calculado (não mais sempre "normal")

## Critério de Sucesso
- [ ] `fetch_ana_rivers()` substituída com novo endpoint funcional
- [ ] `level_cm` e `flow_m3s` retornam valores reais
- [ ] `alert_level` é calculado por heurística de cotas
- [ ] ETL não quebra se API SAR estiver fora do ar (fallback silencioso)
- [ ] KPI "Rios em alerta" na AmbientePage reflete dados reais

## Fontes de Referência
- API SAR ANA: https://telemetriaws1.ana.gov.br/ServiceANA.asmx
- Documentação HidroWeb: https://www.snirh.gov.br/hidroweb/
- Estações telemétricas PR: https://www.snirh.gov.br/hidroweb/mapa
