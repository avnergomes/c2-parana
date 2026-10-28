#!/usr/bin/env python3
"""Gera supabase/functions/_shared/pr_geometria.ts a partir de
public/data/municipios-pr.geojson.

As Edge Functions nao tem sistema de arquivos para ler o GeoJSON (mesmo
motivo de _shared/pr_municipios.ts), entao a malha viaja no bundle. O
GeoJSON do repo ja e simplificado (~19 vertices por municipio, 4 casas
decimais), o que mantem o modulo em ~150 KB.

Uso (a partir da raiz do repo): python scripts/gen_pr_geometria.py
Regenerar sempre que o GeoJSON mudar; scripts/pr_geo.py le o GeoJSON
direto, entao os dois runtimes atribuem o mesmo municipio ao mesmo ponto.
"""

import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(RAIZ, "public", "data", "municipios-pr.geojson")
SAIDA = os.path.join(RAIZ, "supabase", "functions", "_shared", "pr_geometria.ts")


def aneis(geom):
    """Anel externo de cada poligono (o GeoJSON do PR nao tem furos)."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def main():
    with open(GEOJSON, encoding="utf-8") as f:
        gj = json.load(f)
    linhas = []
    for feat in sorted(gj["features"], key=lambda ft: str(ft["properties"].get("CD_MUN") or ft["properties"].get("codarea"))):
        props = feat["properties"]
        ibge = str(props.get("CD_MUN") or props.get("codarea"))
        nome = props["NM_MUN"]
        for anel in aneis(feat["geometry"]):
            plano = ",".join(f"{round(lon, 4)},{round(lat, 4)}" for lon, lat in anel)
            linhas.append(f'  ["{ibge}", {json.dumps(nome, ensure_ascii=False)}, [{plano}]],')
    corpo = "\n".join(linhas)
    cabecalho = (
        "// supabase/functions/_shared/pr_geometria.ts\n"
        "//\n"
        "// GERADO por scripts/gen_pr_geometria.py a partir de\n"
        "// public/data/municipios-pr.geojson. Nao editar a mao: regenerar.\n"
        "//\n"
        "// Um anel externo por linha: [ibge, nome oficial, lon0,lat0,lon1,lat1,...].\n"
        "// Usado por _shared/pr_geo.ts (ponto-no-poligono).\n\n"
        "export const PR_ANEIS: ReadonlyArray<readonly [ibge: string, nome: string, coords: readonly number[]]> = [\n"
    )
    with open(SAIDA, "w", encoding="utf-8") as f:
        f.write(cabecalho + corpo + "\n]\n")
    print(f"{SAIDA}: {len(linhas)} aneis")


if __name__ == "__main__":
    main()
