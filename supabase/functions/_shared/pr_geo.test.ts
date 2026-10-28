// npx deno test supabase/functions/_shared/pr_geo.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { municipioDoPonto, pontoNoAnel } from './pr_geo.ts'
import { PR_ANEIS } from './pr_geometria.ts'

Deno.test('pontos conhecidos caem no municipio certo', () => {
  const casos: [number, number, string][] = [
    [-25.4284, -49.2733, '4106902'], // Curitiba, centro
    [-23.3045, -51.1696, '4113700'], // Londrina, centro
    [-25.5163, -54.5854, '4108304'], // Foz do Iguacu, centro (a oeste de -54)
    [-24.0806, -54.2563, '4108809'], // Guaira, centro (a oeste de -54)
    [-24.5584, -54.0569, '4114609'], // Marechal Candido Rondon
  ]
  for (const [lat, lon, ibge] of casos) {
    assertEquals(municipioDoPonto(lat, lon)?.ibge, ibge, `${lat},${lon}`)
  }
})

Deno.test('fora do PR devolve null', () => {
  assertEquals(municipioDoPonto(-23.0, -48.5), null) // SP
  assertEquals(municipioDoPonto(-27.2, -50.5), null) // SC
  assertEquals(municipioDoPonto(-22.0, -54.0), null) // MS
  assertEquals(municipioDoPonto(-24.5, -54.9), null) // Paraguai
  assertEquals(municipioDoPonto(-25.9, -47.9), null) // oceano
  assertEquals(municipioDoPonto(Number.NaN, -50), null)
})

Deno.test('ponto interior de cada municipio cai nele mesmo', () => {
  let conferidos = 0
  const erros: string[] = []
  for (const [ibge, nome, coords] of PR_ANEIS) {
    // media dos vertices; se cair fora (poligono concavo), pula
    let x = 0
    let y = 0
    for (let i = 0; i < coords.length; i += 2) {
      x += coords[i]
      y += coords[i + 1]
    }
    x /= coords.length / 2
    y /= coords.length / 2
    if (!pontoNoAnel(x, y, coords)) continue
    conferidos++
    const achado = municipioDoPonto(y, x)
    if (achado?.ibge !== ibge) erros.push(`${nome}: ${achado?.nome ?? 'null'}`)
  }
  assert(conferidos > 350, `so ${conferidos} pontos interiores`)
  assert(erros.length <= 3, `${erros.length} pontos em municipio errado: ${erros.slice(0, 10).join('; ')}`)
})

Deno.test('cidades vizinhas a mais de 0,5 km da divisa ficam fora', () => {
  assertEquals(municipioDoPonto(-26.1115, -49.8053), null) // Mafra-SC (~1,0 km de Rio Negro)
  assertEquals(municipioDoPonto(-26.255, -53.646), null) // Bernardo de Irigoyen-AR (~0,8 km de Barracao)
  assertEquals(municipioDoPonto(-25.5975, -54.5786), null) // Puerto Iguazu-AR (~0,7 km de Foz)
  assertEquals(municipioDoPonto(-25.5097, -54.6111), null) // Ciudad del Este-PY (~1,0 km de Foz)
})

Deno.test('divisa estadual: 250 m fora ainda e do PR, 1 km fora nao', () => {
  // Pontos na normal de um trecho da divisa de Guaira com o Paraguai/MS.
  assertEquals(municipioDoPonto(-24.13614, -54.34228)?.ibge, '4108809')
  assertEquals(municipioDoPonto(-24.13444, -54.34943), null)
})

Deno.test('empate de distancia fica com o menor codigo IBGE', () => {
  // Pontos fora da malha, equidistantes (a menos de 1e-15 km) de dois
  // municipios que dividem o vertice da divisa estadual. Sem a margem de
  // empate, o resultado dependia do ultimo bit do Math.hypot.
  assertEquals(municipioDoPonto(-22.81043, -53.4128)?.ibge, '4120200') // Porto Rico x Querencia do Norte
  assertEquals(municipioDoPonto(-26.47, -52.16)?.ibge, '4105706') // Clevelandia x Palmas
  assertEquals(municipioDoPonto(-22.90355, -50.6361)?.ibge, '4113403') // Leopolis x Santa Mariana
})
