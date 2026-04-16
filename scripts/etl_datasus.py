#!/usr/bin/env python3
"""ETL DataSUS SIH (Morbidade Hospitalar) — Fase 5.F do plano C4ISR.

Baixa os arquivos mensais RDPR (Reduced Database, Paraná) do FTP do DataSUS,
converte de DBC para DataFrame via pysus, agrega por município + capítulo CID,
e faz upsert em datasus_sih.

Dependencia: pysus >= 0.17 (instala pyreaddbc e pandas). pyreaddbc traz wheels
pre-compilados para linux_x86_64 e macos — no runner GitHub Actions deve
instalar sem compilar.

Cron mensal (dia 5 as 02:00 UTC) porque o MS libera dados com ~40 dias de delay.

Uso manual:
    python scripts/etl_datasus.py --month 2026-03
    python scripts/etl_datasus.py --last-n-months 6
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
STATE_UF = os.environ.get("DATASUS_UF", "PR")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


# ─── CID-10 CHAPTERS ─────────────────────────────────────────────────

CID_CHAPTERS: dict[int, tuple[str, str, str]] = {
    1:  ("A00", "B99", "Doenças infecciosas e parasitárias"),
    2:  ("C00", "D48", "Neoplasias"),
    3:  ("D50", "D89", "Doenças do sangue"),
    4:  ("E00", "E90", "Doenças endócrinas e metabólicas"),
    5:  ("F00", "F99", "Transtornos mentais"),
    6:  ("G00", "G99", "Doenças do sistema nervoso"),
    7:  ("H00", "H59", "Doenças do olho"),
    8:  ("H60", "H95", "Doenças do ouvido"),
    9:  ("I00", "I99", "Doenças do aparelho circulatório"),
    10: ("J00", "J99", "Doenças do aparelho respiratório"),
    11: ("K00", "K93", "Doenças do aparelho digestivo"),
    12: ("L00", "L99", "Doenças da pele"),
    13: ("M00", "M99", "Doenças musculoesqueléticas"),
    14: ("N00", "N99", "Doenças do aparelho genitourinário"),
    15: ("O00", "O99", "Gravidez, parto e puerpério"),
    16: ("P00", "P96", "Afecções perinatais"),
    17: ("Q00", "Q99", "Malformações congênitas"),
    18: ("R00", "R99", "Sintomas e achados clínicos"),
    19: ("S00", "T98", "Lesões e envenenamentos"),
    20: ("V01", "Y98", "Causas externas"),
    21: ("Z00", "Z99", "Fatores que influenciam a saúde"),
    22: ("U00", "U99", "Códigos para propósitos especiais"),
}


def cid_chapter_for(icd_code: str | None) -> tuple[int | None, str | None]:
    """Dado um codigo CID-10 (ex 'J189'), retorna (chapter_num, label)."""
    if not icd_code or len(icd_code) < 3:
        return None, None
    prefix = icd_code[:3].upper()
    for num, (start, end, label) in CID_CHAPTERS.items():
        if start <= prefix <= end:
            return num, label
    return None, None


# ─── ARG PARSE ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class Args:
    months: list[date]
    state: str


def parse_args() -> Args:
    parser = argparse.ArgumentParser(description="ETL DataSUS SIH")
    parser.add_argument("--month", help="YYYY-MM (default: 2 meses atras)")
    parser.add_argument(
        "--last-n-months",
        type=int,
        default=0,
        help="backfill dos N ultimos meses (aplicado alem de --month)",
    )
    parser.add_argument("--state", default=STATE_UF)
    ns = parser.parse_args()

    today = date.today().replace(day=1)
    # MS libera dados com ~40 dias de delay; default: mes atual menos 2
    default_month = (today - timedelta(days=1)).replace(day=1)
    default_month = (default_month - timedelta(days=1)).replace(day=1)

    target = default_month
    if ns.month:
        y, m = map(int, ns.month.split("-"))
        target = date(y, m, 1)

    months = [target]
    for i in range(1, max(0, ns.last_n_months)):
        prev = (months[-1] - timedelta(days=1)).replace(day=1)
        months.append(prev)

    return Args(months=list(reversed(months)), state=ns.state.upper())


# ─── DATASUS DOWNLOAD ────────────────────────────────────────────────

def try_import_pysus() -> Any:
    """Importa pysus lazily e emite mensagem amigavel se falhar."""
    try:
        from pysus.ftp.databases.sih import SIH  # type: ignore

        return SIH
    except Exception as err:  # noqa: BLE001
        print("  ERRO: pysus nao esta instalado ou nao compatível.")
        print(f"  Detalhe: {err}")
        print("  Sugestao: adicione 'pysus>=0.17' em scripts/requirements.txt")
        return None


def fetch_sih_data(state: str, month: date, SIH: Any) -> Any | None:
    """Baixa o arquivo RD<UF><AAMM>.dbc e retorna DataFrame pandas.

    sih.download() devolve ParquetSet ou List[ParquetSet], cada um
    com .to_dataframe() que concatena todos os parquets do diretorio.
    """
    try:
        sih = SIH().load()  # noqa: N806
        files = sih.get_files(
            group="RD",  # AIH Reduzida
            uf=state,
            month=month.month,
            year=month.year,
        )
        if not files:
            print(f"  sem arquivo RD{state}{month.strftime('%y%m')} no FTP")
            return None
        print(f"  baixando {files[0].name}...")
        result = sih.download(files)

        import pandas as pd  # type: ignore

        if result is None:
            return None
        if isinstance(result, list):
            dfs = [p.to_dataframe() for p in result if p is not None]
        else:
            dfs = [result.to_dataframe()]
        if not dfs:
            return None
        return pd.concat(dfs, ignore_index=True)
    except Exception as err:  # noqa: BLE001
        print(f"  falha ao baixar/ler: {err}")
        return None


# ─── AGREGACAO ───────────────────────────────────────────────────────

def aggregate_sih(df: Any, competencia: date) -> list[dict[str, Any]]:
    """Agrega DataFrame bruto RD por (ibge, capitulo_cid)."""
    if df is None or df.empty:
        return []

    # Colunas esperadas em RD (docs do SIHSUS):
    #   MUNIC_RES  - municipio de residencia (6 dig IBGE)
    #   DIAG_PRINC - diagnostico principal (CID-10)
    #   MORTE      - '1' se obito
    #   VAL_TOT    - valor total AIH (Decimal)
    #   DIAS_PERM  - dias de permanencia
    need = {"MUNIC_RES", "DIAG_PRINC"}
    missing = need - set(df.columns)
    if missing:
        print(f"  WARN colunas ausentes: {missing}")
        return []

    # Enriquecer com capitulo CID
    df = df.copy()
    df["_cid_chapter"] = df["DIAG_PRINC"].map(lambda c: cid_chapter_for(c)[0])
    df["_cid_label"] = df["DIAG_PRINC"].map(lambda c: cid_chapter_for(c)[1])

    # Normaliza ibge: SIH usa 6 dig (sem DV); convertemos para 7 dig com DV=0 fill
    def to_ibge7(code: Any) -> str | None:
        s = str(code).strip().zfill(6)
        if len(s) != 6 or not s.isdigit():
            return None
        return s + "0"

    df["_ibge7"] = df["MUNIC_RES"].map(to_ibge7)

    # Valores numericos
    if "MORTE" in df.columns:
        df["_obito"] = (df["MORTE"].astype(str) == "1").astype(int)
    else:
        df["_obito"] = 0
    if "VAL_TOT" not in df.columns:
        df["VAL_TOT"] = 0.0
    if "DIAS_PERM" not in df.columns:
        df["DIAS_PERM"] = 0

    grouped = df.groupby(["_ibge7", "_cid_chapter"], dropna=False).agg(
        internacoes=("_ibge7", "size"),
        obitos=("_obito", "sum"),
        valor_total_reais=("VAL_TOT", "sum"),
        dias_permanencia=("DIAS_PERM", "sum"),
    ).reset_index()

    records: list[dict[str, Any]] = []
    for row in grouped.itertuples(index=False):
        ibge = getattr(row, "_ibge7")
        if not ibge:
            continue
        cid_chapter = getattr(row, "_cid_chapter")
        cid_label = None
        if cid_chapter is not None:
            cid_label = CID_CHAPTERS[int(cid_chapter)][2]
        records.append({
            "ibge_code": ibge,
            "competencia": competencia.isoformat(),
            "cid_chapter": int(cid_chapter) if cid_chapter is not None else None,
            "cid_chapter_label": cid_label,
            "internacoes": int(row.internacoes),
            "obitos": int(row.obitos),
            "valor_total_reais": round(float(row.valor_total_reais), 2),
            "dias_permanencia": int(row.dias_permanencia),
        })
    return records


# ─── SUPABASE I/O ────────────────────────────────────────────────────

def postgrest_upsert(table: str, records: list[dict[str, Any]], on_conflict: str) -> tuple[bool, int]:
    if not records:
        return True, 0
    headers = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    total = 0
    for i in range(0, len(records), 500):
        batch = records[i : i + 500]
        url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
        resp = requests.post(url, headers=headers, json=batch, timeout=60)
        if resp.status_code not in (200, 201, 204):
            print(
                f"  ERRO upsert {table} lote {i}: HTTP {resp.status_code} "
                f"- {resp.text[:300]}"
            )
            return False, total
        total += len(batch)
    return True, total


def log_ingestion(competencia: date, status: str, rows: int, error: str | None) -> None:
    payload = {
        "competencia": competencia.isoformat(),
        "rows_inserted": rows,
        "rows_updated": 0,
        "source_file": f"RD{STATE_UF}{competencia.strftime('%y%m')}.dbc",
        "status": status,
        "error_message": error,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/datasus_sih_ingestion_log"
        f"?on_conflict=competencia",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates"},
        json=payload,
        timeout=15,
    )
    if resp.status_code not in (200, 201, 204):
        print(
            f"  WARN log ingestion HTTP {resp.status_code}: {resp.text[:200]}"
        )


# ─── MAIN ────────────────────────────────────────────────────────────

def process_month(competencia: date, state: str, SIH: Any) -> bool:
    print(f"\n--- Competência {competencia.isoformat()} ({state}) ---")
    df = fetch_sih_data(state, competencia, SIH)
    if df is None:
        log_ingestion(competencia, "failed", 0, "download/read failed")
        return False

    records = aggregate_sih(df, competencia)
    if not records:
        log_ingestion(competencia, "partial", 0, "aggregation yielded zero rows")
        return False

    ok, total = postgrest_upsert(
        "datasus_sih",
        records,
        on_conflict="ibge_code,competencia,cid_chapter",
    )
    status = "success" if ok else "failed"
    err = None if ok else "upsert failed"
    log_ingestion(competencia, status, total, err)
    print(f"  {total} linhas upserted ({status})")
    return ok


def main() -> int:
    args = parse_args()
    start = datetime.now(timezone.utc)
    print("=" * 60)
    print(f"ETL DataSUS SIH — UF={args.state}")
    print(f"Meses: {', '.join(m.isoformat() for m in args.months)}")
    print("=" * 60)

    SIH = try_import_pysus()  # noqa: N806
    if SIH is None:
        return 10

    any_ok = False
    for month in args.months:
        if process_month(month, args.state, SIH):
            any_ok = True

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\nDONE em {elapsed:.1f}s — any_ok={any_ok}")
    return 0 if any_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
