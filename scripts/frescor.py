"""Idade maxima de cada leitura para valer como estado atual.

Especificacao de supabase/functions/_shared/frescor.ts. Uma leitura mais
velha que isso nao conta: o IRTC tira o dominio da media e os consumidores
de river_levels (alertas, correlacoes, relatorio) a ignoram.
"""

from datetime import datetime, timedelta, timezone

# clima_data: o etl-clima roda a cada 15 min; 36 h so tiram estacao parada.
CLIMA_MAX_IDADE_H = 36
# river_levels: o etl-ambiente roda a cada 6 h; 12 h = dois ciclos.
RIO_MAX_IDADE_H = 12
# air_quality: mesmo ciclo do etl-ambiente; estacao WAQI parada ha dias sai.
AR_MAX_IDADE_H = 36
# dengue_data: a semana epidemiologica terminou ha no maximo 4 semanas.
DENGUE_MAX_IDADE_DIAS = 28


def agora_utc():
    return datetime.now(timezone.utc)


def parse_ts(valor):
    """timestamptz do PostgREST -> datetime com fuso (sem fuso = UTC)."""
    if not valor:
        return None
    try:
        t = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def leitura_fresca(observed_at, agora, max_horas):
    """Leitura com timestamp de ate `max_horas` horas atras."""
    t = parse_ts(observed_at)
    return t is not None and (agora - t) <= timedelta(hours=max_horas)


def leitura_rio_valida(r, agora):
    """Leitura de rio que vale como estado atual: nivel medido e ate 12 h."""
    return r.get("level_cm") is not None and leitura_fresca(r.get("observed_at"), agora, RIO_MAX_IDADE_H)
