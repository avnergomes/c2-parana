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

Deno.test('fresta da simplificacao: ponto a menos de 2 km da borda ainda e do PR', () => {
  // Um vertice da borda de Curitiba deslocado ~500 m para fora de todos os aneis.
  const [, , coords] = PR_ANEIS.find(([ibge]) => ibge === '4106902')!
  const lon = coords[0]
  const lat = coords[1]
  const achado = municipioDoPonto(lat + 0.0045, lon)
  assert(achado !== null, 'ponto a ~500 m da borda deveria ser atribuido')
})
