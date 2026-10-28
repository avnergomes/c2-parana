"""Ponto -> municipio do PR por ponto-no-poligono.

Especificacao de supabase/functions/_shared/pr_geo.ts (mesma regra, mesma
malha): le public/data/municipios-pr.geojson, que gera o pr_geometria.ts
das Edge Functions via scripts/gen_pr_geometria.py.

  1. ponto dentro de um poligono -> esse municipio (o primeiro, na ordem do
     IBGE, se cair numa sobreposicao da malha simplificada);
  2. senao, a borda mais proxima a ate `tolerancia_km` (padrao 2 km) ->
     esse municipio (frestas da simplificacao e a linha da costa);
  3. senao -> None: o ponto esta fora do PR e deve ser descartado.
"""

import json
import math
import os

GEOJSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "data", "municipios-pr.geojson",
)

KM_POR_GRAU_LAT = 110.574
KM_POR_GRAU_LON_EQUADOR = 111.32

_ANEIS = None


def _carregar():
    global _ANEIS
    if _ANEIS is not None:
        return _ANEIS
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        gj = json.load(f)
    aneis = []
    for feat in gj["features"]:
        props = feat["properties"]
        ibge = str(props.get("CD_MUN") or props.get("codarea"))
        nome = props["NM_MUN"]
        geom = feat["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        for poly in polys:
            coords = [(round(lon, 4), round(lat, 4)) for lon, lat in poly[0]]
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            aneis.append({
                "ibge": ibge, "nome": nome, "coords": coords,
                "min_lon": min(lons), "max_lon": max(lons),
                "min_lat": min(lats), "max_lat": max(lats),
            })
    aneis.sort(key=lambda a: a["ibge"])
    _ANEIS = aneis
    return aneis


def ponto_no_anel(lon, lat, coords):
    """Ray casting (regra par-impar)."""
    dentro = False
    n = len(coords)
    j = n - 1
    for i in range(n):
        xi, yi = coords[i]
        xj, yj = coords[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def distancia_ao_anel_km(lon, lat, coords):
    """Distancia (km) do ponto a borda do anel, em projecao equiretangular local."""
    kx = KM_POR_GRAU_LON_EQUADOR * math.cos(math.radians(lat))
    ky = KM_POR_GRAU_LAT
    melhor = float("inf")
    n = len(coords)
    j = n - 1
    for i in range(n):
        ax, ay = (coords[j][0] - lon) * kx, (coords[j][1] - lat) * ky
        bx, by = (coords[i][0] - lon) * kx, (coords[i][1] - lat) * ky
        dx, dy = bx - ax, by - ay
        len2 = dx * dx + dy * dy
        t = 0.0 if len2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / len2))
        melhor = min(melhor, math.hypot(ax + t * dx, ay + t * dy))
        j = i
    return melhor


def municipio_do_ponto(lat, lon, tolerancia_km=2.0):
    """{'ibge', 'nome'} do municipio que contem o ponto, ou None fora do PR."""
    if lat is None or lon is None or not (math.isfinite(lat) and math.isfinite(lon)):
        return None
    aneis = _carregar()
    for a in aneis:
        if a["min_lon"] <= lon <= a["max_lon"] and a["min_lat"] <= lat <= a["max_lat"]:
            if ponto_no_anel(lon, lat, a["coords"]):
                return {"ibge": a["ibge"], "nome": a["nome"]}
    if tolerancia_km <= 0:
        return None
    folga_lat = tolerancia_km / KM_POR_GRAU_LAT
    folga_lon = tolerancia_km / (KM_POR_GRAU_LON_EQUADOR * math.cos(math.radians(lat)))
    melhor = None
    melhor_km = tolerancia_km
    for a in aneis:
        if (lon < a["min_lon"] - folga_lon or lon > a["max_lon"] + folga_lon
                or lat < a["min_lat"] - folga_lat or lat > a["max_lat"] + folga_lat):
            continue
        d = distancia_ao_anel_km(lon, lat, a["coords"])
        if d <= melhor_km:
            melhor_km = d
            melhor = a
    return {"ibge": melhor["ibge"], "nome": melhor["nome"]} if melhor else None
