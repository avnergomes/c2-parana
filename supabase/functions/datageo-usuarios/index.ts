// supabase/functions/datageo-usuarios/index.ts
//
// Cadastro de usuarios do DataGeo (dgp-comando.github.io), so para quem tem
// app_metadata.datageo_admin = true. Mesmo esquema do import do SISATER
// (datageo-command/scripts/import_usuarios_sisater.py):
//   e-mail <matricula>@sisater.local, senha 'dgp:' + matricula invertida,
//   troca obrigatoria no primeiro acesso.
// Acoes (POST JSON):
//   { acao: 'criar',   matricula, nome }  -> 201 | 409 se ja existe
//   { acao: 'resetar', matricula }        -> volta a senha para a inicial (e religa o acesso)
//   { acao: 'revogar', matricula }        -> tira app_metadata.datageo (matricula ou e-mail);
//                                            o JWT ja emitido vale ate expirar (<= 1 h)
//   { acao: 'reativar', matricula }       -> religa app_metadata.datageo (senha intacta)
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

async function acharPorEmail(admin: ReturnType<typeof createClient<any, "public", any>>, email: string): Promise<User | null> {
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

  try {
    if (body.acao === 'revogar' || body.acao === 'reativar') {
      // Usuarios do c2 entram por e-mail; os do SISATER, pela matricula.
      const email = matricula.includes('@') ? matricula.toLowerCase() : emailDe(matricula)
      const valido = matricula.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : /^\d{3,10}$/.test(matricula)
      if (!valido) {
        return resp(400, { error: 'Informe a matrícula ou o e-mail' })
      }
      const alvo = await acharPorEmail(admin, email)
      if (!alvo) return resp(404, { error: 'Usuário não encontrado' })
      if (body.acao === 'reativar') {
        if (alvo.app_metadata?.datageo === true) return resp(409, { error: 'Usuário já tem acesso' })
        const { revogado_por: _p, revogado_em: _e, ...resto } = alvo.app_metadata ?? {}
        const { error } = await admin.auth.admin.updateUserById(alvo.id, {
          app_metadata: { ...resto, datageo: true, reativado_por: quem.id, reativado_em: new Date().toISOString() },
        })
        if (error) throw error
        console.log(`[datageo-usuarios] ${quem.id} reativou ${email}`)
        return resp(200, { ok: true, nome: alvo.user_metadata?.nome ?? null })
      }
      if (alvo.id === quem.id) return resp(400, { error: 'Você não pode revogar o próprio acesso' })
      if (alvo.app_metadata?.datageo_admin === true) return resp(403, { error: 'Usuário é administrador; revogue pela service key' })
      if (alvo.app_metadata?.datageo !== true) return resp(409, { error: 'Usuário já está sem acesso' })
      const { error } = await admin.auth.admin.updateUserById(alvo.id, {
        app_metadata: { ...alvo.app_metadata, datageo: false, revogado_por: quem.id, revogado_em: new Date().toISOString() },
      })
      if (error) throw error
      console.log(`[datageo-usuarios] ${quem.id} revogou ${email}`)
      return resp(200, { ok: true, nome: alvo.user_metadata?.nome ?? null })
    }

    if (!/^\d{3,10}$/.test(matricula)) return resp(400, { error: 'Matrícula deve ter de 3 a 10 dígitos' })

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
