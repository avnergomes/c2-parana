#!/usr/bin/env python3
"""ETL Saude: InfoDengue por municipio PR - versao otimizada com concorrencia e adaptive backoff."""

import json
import os
import time
from pathlib import Path

import requests
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

CURRENT_YEAR = datetime.now().year

HTTP_SESSION = requests.Session()
HTTP_SESSION.headers.update({
    "User-Agent": "c2-parana-etl/1.0 (+https://github.com/avnergomes/c2-parana)",
    "Accept": "application/json",
})
REQUEST_TIMEOUT = (10, 20)

# =====================================================
# ESTRATEGIA: Dois tiers de municipios
# Tier 1 (50 maiores): ~80% da populacao PR -> rodar SEMPRE
# Tier 2 (349 restantes): rodar semanal via FULL_RUN=true
# =====================================================

# Top 50 municipios PR por populacao (cobrindo ~80% da pop do estado)
TIER1_MUNICIPIOS = [
    {"ibge": "4106902", "name": "Curitiba"},
    {"ibge": "4113700", "name": "Londrina"},
    {"ibge": "4115200", "name": "Maringa"},
    {"ibge": "4119905", "name": "Ponta Grossa"},
    {"ibge": "4104808", "name": "Cascavel"},
    {"ibge": "4108304", "name": "Foz do Iguacu"},
    {"ibge": "4105508", "name": "Colombo"},
    {"ibge": "4109401", "name": "Guarapuava"},
    {"ibge": "4118204", "name": "Paranagua"},
    {"ibge": "4101804", "name": "Araucaria"},
    {"ibge": "4127700", "name": "Toledo"},
    {"ibge": "4101307", "name": "Apucarana"},
    {"ibge": "4119152", "name": "Pinhais"},
    {"ibge": "4104402", "name": "Campo Mourao"},
    {"ibge": "4128104", "name": "Umuarama"},
    {"ibge": "4118601", "name": "Paranavai"},
    {"ibge": "4107652", "name": "Fazenda Rio Grande"},
    {"ibge": "4100400", "name": "Almirante Tamandare"},
    {"ibge": "4103404", "name": "Cambe"},
    {"ibge": "4125506", "name": "Sao Jose dos Pinhais"},
    {"ibge": "4103602", "name": "Campo Largo"},
    {"ibge": "4120200", "name": "Rolandia"},
    {"ibge": "4106571", "name": "Cianorte"},
    {"ibge": "4107207", "name": "Cornelio Procopio"},
    {"ibge": "4110706", "name": "Irati"},
    {"ibge": "4128302", "name": "Uniao da Vitoria"},
    {"ibge": "4113601", "name": "Lapa"},
    {"ibge": "4115804", "name": "Medianeira"},
    {"ibge": "4117602", "name": "Palmas"},
    {"ibge": "4108957", "name": "Goioere"},
    {"ibge": "4116208", "name": "Marechal Candido Rondon"},
    {"ibge": "4112504", "name": "Jaguariaiva"},
    {"ibge": "4114302", "name": "Mandaguari"},
    {"ibge": "4126256", "name": "Sarandi"},
    {"ibge": "4102802", "name": "Bandeirantes"},
    {"ibge": "4107538", "name": "Dois Vizinhos"},
    {"ibge": "4108403", "name": "Francisco Beltrao"},
    {"ibge": "4117206", "name": "Ortigueira"},
    {"ibge": "4117271", "name": "Paicandu"},
    {"ibge": "4118402", "name": "Pato Branco"},
    {"ibge": "4118707", "name": "Pinhao"},
    {"ibge": "4119103", "name": "Pitanga"},
    {"ibge": "4120606", "name": "Santa Fe"},
    {"ibge": "4126306", "name": "Santo Antonio da Platina"},
    {"ibge": "4127106", "name": "Telemaco Borba"},
    {"ibge": "4128500", "name": "Wenceslau Braz"},
    {"ibge": "4105805", "name": "Corbelia"},
    {"ibge": "4121208", "name": "Santa Helena"},
    {"ibge": "4101002", "name": "Ampere"},
    {"ibge": "4114609", "name": "Marialva"},
]


# =====================================================
# ESTADO COMPARTILHADO PARA RATE LIMITING ADAPTATIVO
# =====================================================
class AdaptiveRateLimiter:
    """Gerencia rate limiting com adaptive backoff e circuit breaker."""

    def __init__(self, initial_delay_ms=100):
        self.base_delay_ms = initial_delay_ms
        self.current_delay_ms = initial_delay_ms
        # RLock (not Lock) because check_circuit_breaker() acquires the lock
        # and then calls get_error_rate() which also acquires it — a plain
        # Lock would self-deadlock on the first worker call.
        self.lock = threading.RLock()

        # Rastreamento de erros global
        self.total_requests = 0
        self.total_errors = 0
        self.consecutive_errors = 0
        self.circuit_breaker_open = False

    def wait(self):
        """Aplica delay com base no estado atual."""
        with self.lock:
            if self.circuit_breaker_open:
                time.sleep(0.5)  # Delay maior se circuit breaker aberto
            else:
                time.sleep(self.current_delay_ms / 1000.0)

    def on_success(self):
        """Callback de sucesso - reseta delay adaptativo."""
        with self.lock:
            self.total_requests += 1
            self.consecutive_errors = 0
            # Reset gradual: reduce delay 5% por sucesso, min 100ms
            self.current_delay_ms = max(100, self.current_delay_ms * 0.95)

            # Reabilita circuit breaker se erro rate melhorou
            if self.circuit_breaker_open and self.get_error_rate() < 0.30:
                print(f"  [CircuitBreaker] Taxa de erro < 30%, reabrindo circuito")
                self.circuit_breaker_open = False

    def on_429(self):
        """Callback rate limit (429) - adaptive backoff."""
        with self.lock:
            self.total_requests += 1
            self.total_errors += 1
            self.consecutive_errors += 1
            # Dobra o delay em 429
            self.current_delay_ms = min(self.current_delay_ms * 2, 10000)  # Max 10s
            print(f"  [RateLimit] 429 recebido, novo delay: {self.current_delay_ms}ms")

    def on_error(self):
        """Callback de erro generico."""
        with self.lock:
            self.total_requests += 1
            self.total_errors += 1
            self.consecutive_errors += 1
            # Pequeno aumento no delay para erros genéricos
            self.current_delay_ms = min(self.current_delay_ms * 1.2, 10000)

    def get_error_rate(self):
        """Retorna taxa de erro global."""
        with self.lock:
            if self.total_requests == 0:
                return 0.0
            return self.total_errors / self.total_requests

    def check_circuit_breaker(self):
        """Verifica se deve abrir circuit breaker."""
        with self.lock:
            error_rate = self.get_error_rate()
            if error_rate > 0.50:
                self.circuit_breaker_open = True
                return True
            return self.circuit_breaker_open


PR_MUNICIPIOS_JSON = Path(__file__).parent / "pr_municipios.json"


def get_full_pr_municipalities():
    """
    Retorna lista completa de 399 municipios PR.

    Fonte primaria: scripts/pr_municipios.json (cacheado no repo, estavel).
    Fallback: IBGE API live (usado apenas se o JSON nao existir, por ex. em
    dev environment antes do primeiro commit do arquivo).

    A API do IBGE dava connect timeout intermitente do runner GitHub Actions,
    deixando o ETL cair silenciosamente no TIER1 (50 munis) mesmo em
    FULL_RUN=true. Hoje usamos o JSON estatico como fonte de verdade.
    """
    if PR_MUNICIPIOS_JSON.exists():
        try:
            with PR_MUNICIPIOS_JSON.open(encoding="utf-8") as f:
                data = json.load(f)
            print(f"  Lista de municipios carregada do JSON estatico ({len(data)} munis)")
            return data
        except Exception as e:
            print(f"  Erro ao ler {PR_MUNICIPIOS_JSON.name}: {e} - tentando IBGE API")

    url = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        return [{"ibge": str(m["id"]), "name": m["nome"]} for m in data]
    except Exception as e:
        print(f"  Erro ao buscar municipios IBGE: {e}")
        return []


def fetch_dengue_municipality(mun: dict, limiter: AdaptiveRateLimiter) -> dict:
    """
    Busca dados de dengue para um municipio com retry automático.
    Retorna dict com chaves: success, data, error_msg
    """
    mun_name = mun["name"]
    mun_ibge = mun["ibge"]

    # Tentar 2 vezes (1 tentativa + 1 retry)
    for attempt in range(2):
        if limiter.check_circuit_breaker():
            return {
                "success": False,
                "data": [],
                "error_msg": "Circuit breaker aberto (taxa de erro > 50%)",
                "mun_ibge": mun_ibge,
                "mun_name": mun_name,
            }

        # Aplicar backoff adaptativo ANTES de cada tentativa
        limiter.wait()

        url = f"https://info.dengue.mat.br/api/alertcity?geocode={mun_ibge}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start={CURRENT_YEAR - 1}&ey_end={CURRENT_YEAR}"

        try:
            resp = HTTP_SESSION.get(url, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 429:
                limiter.on_429()
                if attempt == 0:
                    print(f"  [429] {mun_name} - Retry em 2s...")
                    time.sleep(2)
                    continue
                else:
                    return {
                        "success": False,
                        "data": [],
                        "error_msg": f"Rate limited (429) após retry",
                        "mun_ibge": mun_ibge,
                        "mun_name": mun_name,
                    }

            if resp.status_code != 200:
                limiter.on_error()
                if attempt == 0:
                    print(f"  [HTTP {resp.status_code}] {mun_name} - Retry em 2s...")
                    time.sleep(2)
                    continue
                else:
                    return {
                        "success": False,
                        "data": [],
                        "error_msg": f"HTTP {resp.status_code}",
                        "mun_ibge": mun_ibge,
                        "mun_name": mun_name,
                    }

            records = resp.json()
            dengue_records = []

            # InfoDengue returns records in DESCENDING order (newest first).
            # Pegamos ate 52 semanas (1 ano) por run para preencher gaps de
            # historico (antes pegava so 4, o que criava buracos quando runs
            # consecutivos nao cobriam semanas contiguas). Upsert na tabela
            # e idempotente (on_conflict=ibge_code,year,epidemiological_week)
            # entao re-inserir e seguro e acelera backfill.
            for rec in records[:52]:
                try:
                    se = int(rec.get("SE", 0))
                    year = int(str(se)[:4]) if se > 10000 else CURRENT_YEAR
                    week = int(str(se)[4:]) if se > 10000 else se

                    # Limitar alert_level a 4 (constraint do banco)
                    alert_level = min(int(rec.get("nivel", 0) or 0), 4)

                    dengue_records.append({
                        "ibge_code": mun_ibge,
                        "municipality_name": mun_name,
                        "epidemiological_week": week,
                        "year": year,
                        "cases": int(rec.get("casos", 0) or 0),
                        "cases_est": float(rec.get("casos_est", 0) or 0),
                        "alert_level": alert_level,
                        "incidence_rate": float(rec.get("inc100k", 0) or 0),
                        "population": int(rec.get("pop", 0) or 0) or None,
                    })
                except:
                    continue

            limiter.on_success()
            return {
                "success": True,
                "data": dengue_records,
                "error_msg": None,
                "mun_ibge": mun_ibge,
                "mun_name": mun_name,
            }

        except requests.exceptions.Timeout:
            limiter.on_error()
            if attempt == 0:
                print(f"  [Timeout] {mun_name} - Retry em 2s...")
                time.sleep(2)
                continue
            else:
                return {
                    "success": False,
                    "data": [],
                    "error_msg": "Timeout",
                    "mun_ibge": mun_ibge,
                    "mun_name": mun_name,
                }
        except Exception as e:
            limiter.on_error()
            if attempt == 0:
                print(f"  [Erro] {mun_name}: {e} - Retry em 2s...")
                time.sleep(2)
                continue
            else:
                return {
                    "success": False,
                    "data": [],
                    "error_msg": str(e),
                    "mun_ibge": mun_ibge,
                    "mun_name": mun_name,
                }

    # Fallback (nunca deve chegar aqui, mas segurança)
    return {
        "success": False,
        "data": [],
        "error_msg": "Falha após retry",
        "mun_ibge": mun_ibge,
        "mun_name": mun_name,
    }


def fetch_dengue_concurrent(municipios: list, max_workers: int = 5) -> tuple:
    """
    Busca dados de dengue para lista de municipios com concorrencia.
    Retorna: (all_dengue, stats_dict)
    """
    limiter = AdaptiveRateLimiter(initial_delay_ms=100)
    all_dengue = []
    failed_municipalities = []
    results_lock = threading.Lock()

    print(f"  Iniciando fetch concorrente com {max_workers} workers...")
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fetch_dengue_municipality, mun, limiter): mun
            for mun in municipios
        }

        completed = 0
        for future in as_completed(futures):
            completed += 1

            # Log de progresso a cada 25 municipios
            if completed % 25 == 0 or completed == len(futures):
                error_rate = limiter.get_error_rate()
                print(f"  Progresso: {completed}/{len(futures)} | Taxa erro: {error_rate:.1%} | Delay: {limiter.current_delay_ms}ms")

            result = future.result()

            with results_lock:
                if result["success"]:
                    all_dengue.extend(result["data"])
                else:
                    failed_municipalities.append({
                        "ibge": result["mun_ibge"],
                        "name": result["mun_name"],
                        "error": result["error_msg"],
                    })

    duration = time.time() - start_time

    stats = {
        "municipalities_processed": len(municipios),
        "municipalities_failed": len(failed_municipalities),
        "records_saved": len(all_dengue),
        "duration_seconds": duration,
        "final_error_rate": limiter.get_error_rate(),
        "errors": [f"{m['name']}: {m['error']}" for m in failed_municipalities[:20]],  # Top 20
    }

    return all_dengue, stats


def upsert_dengue(supabase, records: list) -> int:
    """Insere dados de dengue no Supabase em lotes. Retorna count de registros salvos."""
    if not records:
        return 0

    saved_count = 0

    # Inserir em lotes de 200
    for i in range(0, len(records), 200):
        batch = records[i:i+200]
        try:
            supabase.table("dengue_data").upsert(
                batch,
                on_conflict="ibge_code,year,epidemiological_week"
            ).execute()
            saved_count += len(batch)
        except Exception as e:
            print(f"  Erro upsert lote {i}: {e}")
            # Tentar inserir um por um
            for rec in batch:
                try:
                    supabase.table("dengue_data").upsert(
                        [rec],
                        on_conflict="ibge_code,year,epidemiological_week"
                    ).execute()
                    saved_count += 1
                except:
                    pass

    return saved_count


def upsert_etl_health(supabase, health_record: dict):
    """
    Upsert de ETL health tracking na tabela data_cache.

    Schema real (migration 001_initial_schema.sql): colunas sao cache_key,
    data (JSONB), source, fetched_at, expires_at, metadata. O codigo
    anterior enviava cache_value/updated_at que nao existem, resultando em
    PGRST204 silencioso a cada run.
    """
    try:
        supabase.table("data_cache").upsert(
            {
                "cache_key": "etl_health_saude",
                "data": health_record,
                "source": "etl_saude",
                "fetched_at": datetime.utcnow().isoformat() + "Z",
            },
            on_conflict="cache_key"
        ).execute()
        print("  ETL health upserted com sucesso")
    except Exception as e:
        print(f"  Erro ao upsert ETL health: {e}")


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    start_time = time.time()

    # Verificar se deve rodar modo completo
    is_full_run = os.environ.get("FULL_RUN", "false").lower() == "true"
    mode = "full" if is_full_run else "tier1"

    if is_full_run:
        print("=== MODO COMPLETO: Todos os 399 municipios ===")
        municipios_full = get_full_pr_municipalities()
        if municipios_full:
            municipios = municipios_full
        else:
            print("Falha ao buscar lista completa, usando Tier 1")
            municipios = TIER1_MUNICIPIOS
            mode = "tier1"
    else:
        print("=== MODO RAPIDO: Top 50 municipios (Tier 1) ===")
        municipios = TIER1_MUNICIPIOS

    print(f"Total: {len(municipios)} municipios", flush=True)

    # Fetch concorrente com 2 workers (reduzido de 5 para ser gentil com InfoDengue)
    dengue_data, stats = fetch_dengue_concurrent(municipios, max_workers=2)

    # Upsert dengue data
    records_saved = 0
    if dengue_data:
        records_saved = upsert_dengue(supabase, dengue_data)
        print(f"Dengue: {records_saved} registros salvos")
    else:
        print("Nenhum registro de dengue obtido")

    # Preparar health record
    duration = time.time() - start_time
    status = "success" if stats["municipalities_failed"] == 0 else ("partial" if stats["municipalities_failed"] < len(municipios) * 0.3 else "error")

    health_record = {
        "last_run": datetime.utcnow().isoformat() + "Z",
        "status": status,
        "mode": mode,
        "municipalities_processed": stats["municipalities_processed"],
        "municipalities_failed": stats["municipalities_failed"],
        "records_saved": records_saved,
        "duration_seconds": duration,
        "errors": stats["errors"],
    }

    # Upsert ETL health
    upsert_etl_health(supabase, health_record)

    print("=" * 60)
    print(f"ETL Saude concluido!")
    print(f"Status: {status}")
    print(f"Municipios processados: {stats['municipalities_processed']}")
    print(f"Municipios falhados: {stats['municipalities_failed']}")
    print(f"Registros salvos: {records_saved}")
    print(f"Duracao: {duration:.2f}s")
    print(f"Taxa de erro final: {stats['final_error_rate']:.1%}")
    print("=" * 60)


if __name__ == "__main__":
    main()
