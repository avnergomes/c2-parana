// supabase/functions/datageo-usuarios/index.ts
//
// Cadastro de usuarios do DataGeo (dgp-comando.github.io), so para quem tem
// app_metadata.datageo_admin = true. Mesmo esquema do import do SISATER
// (datageo-command/scripts/import_usuarios_sisater.py):
//   e-mail <matricula>@sisater.local, senha 'dgp:' + matricula invertida,
//   troca obrigatoria no primeiro acesso.
// Acoes (POST JSON):
//   { acao: 'criar',   matricula, nome }  -> 201 | 409 se ja existe
//   { acao: 'resetar', matricula }        -> volta a senha para a inicial
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const EMAIL_DOMINIO = 'sisater.local'
const SENHA_PREFIXO = 'dgp:'
const ORIGENS = ['https://dgp-comando.github.io']

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const ok = ORIGENS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const inverter = (s: string) => [...s].reverse().join('')
const emailDe = (matricula: string) => `${matricula}@${EMAIL_DOMINIO}`

async function acharPorEmail(admin: ReturnType<typeof createClient>, email: string): Promise<User | null> {
  // ponytail: varre a lista (~1,2 mil usuarios, 2 paginas); trocar por RPC se passar de 10 mil.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const achado = data.users.find((u) => u.email === email)
    if (achado) return achado
    if (data.users.length < 1000) return null
  }
}

serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' }
  const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return resp(405, { error: 'Use POST' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
  const { data: { user: quem } } = await admin.auth.getUser(token)
  if (!quem) return resp(401, { error: 'Sessão inválida' })
  if (quem.app_metadata?.datageo_admin !== true) return resp(403, { error: 'Sem permissão de administrador' })

  let body: { acao?: string; matricula?: string; nome?: string }
  try { body = await req.json() } catch { return resp(400, { error: 'JSON inválido' }) }
  const matricula = String(body.matricula ?? '').trim()
  if (!/^\d{3,10}$/.test(matricula)) return resp(400, { error: 'Matrícula deve ter de 3 a 10 dígitos' })

  try {
    if (body.acao === 'criar') {
      const nome = String(body.nome ?? '').trim().replace(/\s+/g, ' ')
      if (nome.length < 3 || nome.length > 120) return resp(400, { error: 'Informe o nome completo' })
      const { error } = await admin.auth.admin.createUser({
        email: emailDe(matricula),
        password: SENHA_PREFIXO + inverter(matricula),
        email_confirm: true,
        app_metadata: { datageo: true, origem: 'cadastro', cadastrado_por: quem.id },
        user_metadata: { matricula, nome, must_change_password: true },
      })
      if (error) {
        if (/already/i.test(error.message)) return resp(409, { error: 'Matrícula já cadastrada' })
        throw error
      }
      console.log(`[datageo-usuarios] ${quem.id} criou ${matricula}`)
      return resp(201, { ok: true })
    }

    if (body.acao === 'resetar') {
      const alvo = await acharPorEmail(admin, emailDe(matricula))
      if (!alvo) return resp(404, { error: 'Matrícula não encontrada' })
      const { error } = await admin.auth.admin.updateUserById(alvo.id, {
        password: SENHA_PREFIXO + inverter(matricula),
        user_metadata: { ...alvo.user_metadata, must_change_password: true },
        app_metadata: { ...alvo.app_metadata, datageo: true },
      })
      if (error) throw error
      console.log(`[datageo-usuarios] ${quem.id} resetou ${matricula}`)
      return resp(200, { ok: true })
    }

    return resp(400, { error: 'Ação desconhecida' })
  } catch (e) {
    console.error('[datageo-usuarios]', e)
    return resp(500, { error: 'Erro interno' })
  }
})
