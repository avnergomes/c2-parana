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
//   { acao: 'externo', matricula, externo } -> marca/desmarca app_metadata.datageo_externo
//                                            (externo nao le o bucket datageo-privado, migration 051)
//   { acao: 'solicitacoes', status? }     -> pedidos de usuarios externos (botao "Solicitar acesso", migration 052)
//   { acao: 'aprovar', id }               -> cria a conta externa (ou religa a existente) e marca aprovada;
//                                            conta nova recebe senha temporaria (devolvida 1 vez)
//   { acao: 'recusar', id }               -> marca recusada (apagada 90 dias depois)
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
// Sem 0/O/1/l/I: a senha temporaria e ditada ou copiada a mao.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const senhaTemporaria = () =>
  [...crypto.getRandomValues(new Uint32Array(12))].map((n) => ALFABETO[n % ALFABETO.length]).join('')
const emailDe = (matricula: string) => `${matricula}@${EMAIL_DOMINIO}`

async function acharPorEmail(admin: ReturnType<typeof createClient<any, 'public', any>>, email: string): Promise<User | null> {
  // ponytail: varre a lista (~1,2 mil usuarios, 2 paginas); trocar por RPC se passar de 10 mil.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const achado = data.users.find((u) => u.email === email)
    if (achado) return achado
    if (data.users.length < 1000) return null
  }
}

type Resp = (status: number, body: unknown) => Response
type Admin = ReturnType<typeof createClient<any, 'public', any>>

/** Aprova (cria ou religa a conta) ou recusa uma solicitacao pendente. */
async function decidir(admin: Admin, quemId: string, acao: string, id: number, resp: Resp): Promise<Response> {
  if (!Number.isInteger(id) || id <= 0) return resp(400, { error: 'Solicitação inválida' })
  const { data: sol, error } = await admin.from('datageo_solicitacao').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!sol) return resp(404, { error: 'Solicitação não encontrada' })
  if (sol.status !== 'pendente') return resp(409, { error: `Solicitação já ${sol.status}` })
  const decisao = { decidido_em: new Date().toISOString(), decidido_por: quemId }

  if (acao === 'recusar') {
    const { error: e } = await admin.from('datageo_solicitacao').update({ ...decisao, status: 'recusada' }).eq('id', id)
    if (e) throw e
    console.log(`[datageo-usuarios] ${quemId} recusou solicitacao ${id}`)
    return resp(200, { ok: true })
  }

  // Solicitacao e so de externo: servidor do IDR entra pela matricula.
  const email = String(sol.email).toLowerCase()
  const existente = await acharPorEmail(admin, email)
  let senha: string | null = null
  let userId: string
  if (existente) {
    // Conta ja existe (usuario do c2, servidor importado, revogado): so religa o acesso.
    if (existente.app_metadata?.datageo_admin === true) return resp(409, { error: 'Conta já é de administrador' })
    const { error: e } = await admin.auth.admin.updateUserById(existente.id, {
      app_metadata: { ...existente.app_metadata, datageo: true, datageo_externo: true, solicitacao_id: id },
    })
    if (e) throw e
    userId = existente.id
  } else {
    senha = senhaTemporaria()
    const { data: novo, error: e } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      app_metadata: { datageo: true, datageo_externo: true, origem: 'solicitacao', solicitacao_id: id, cadastrado_por: quemId },
      user_metadata: { nome: sol.nome, entidade: sol.entidade, must_change_password: true },
    })
    if (e) throw e
    userId = novo.user.id
  }
  const { error: e2 } = await admin.from('datageo_solicitacao')
    .update({ ...decisao, status: 'aprovada', user_id: userId }).eq('id', id)
  if (e2) throw e2
  console.log(`[datageo-usuarios] ${quemId} aprovou solicitacao ${id} (${existente ? 'conta existente' : 'conta nova'})`)
  return resp(200, { ok: true, login: email, conta_existente: Boolean(existente), senha_temporaria: senha })
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

  let body: { acao?: string; matricula?: string; nome?: string; externo?: boolean; id?: number; status?: string }
  try { body = await req.json() } catch { return resp(400, { error: 'JSON inválido' }) }

  if (body.acao === 'solicitacoes') {
    const status = ['pendente', 'aprovada', 'recusada'].includes(String(body.status)) ? String(body.status) : 'pendente'
    const { data, error } = await admin.from('datageo_solicitacao').select('*')
      .eq('status', status).order('criado_em', { ascending: false }).limit(500)
    if (error) { console.error('[datageo-usuarios]', error); return resp(500, { error: 'Erro interno' }) }
    return resp(200, { ok: true, solicitacoes: data })
  }

  if (body.acao === 'aprovar' || body.acao === 'recusar') {
    try {
      return await decidir(admin, quem.id, body.acao, Number(body.id), resp)
    } catch (e) {
      console.error('[datageo-usuarios]', e)
      return resp(500, { error: 'Erro interno' })
    }
  }
  const matricula = String(body.matricula ?? '').trim()

  try {
    if (body.acao === 'revogar' || body.acao === 'reativar' || body.acao === 'externo') {
      // Usuarios do c2 entram por e-mail; os do SISATER, pela matricula.
      const email = matricula.includes('@') ? matricula.toLowerCase() : emailDe(matricula)
      const valido = matricula.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : /^\d{3,10}$/.test(matricula)
      if (!valido) {
        return resp(400, { error: 'Informe a matrícula ou o e-mail' })
      }
      const alvo = await acharPorEmail(admin, email)
      if (!alvo) return resp(404, { error: 'Usuário não encontrado' })
      if (body.acao === 'externo') {
        if (typeof body.externo !== 'boolean') return resp(400, { error: 'Informe externo: true ou false' })
        if (alvo.id === quem.id) return resp(400, { error: 'Você não pode mudar o próprio perfil' })
        if (alvo.app_metadata?.datageo_admin === true) return resp(403, { error: 'Administrador não pode ser externo' })
        const { error } = await admin.auth.admin.updateUserById(alvo.id, {
          app_metadata: { ...alvo.app_metadata, datageo_externo: body.externo },
        })
        if (error) throw error
        console.log(`[datageo-usuarios] ${quem.id} marcou ${email} externo=${body.externo}`)
        return resp(200, { ok: true, nome: alvo.user_metadata?.nome ?? null })
      }
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
