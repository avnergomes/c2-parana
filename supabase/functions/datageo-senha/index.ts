// supabase/functions/datageo-senha/index.ts
//
// "Esqueci minha senha" do DataGeo, sem e-mail (o login do SISATER e
// sintetico, <matricula>@sisater.local, e o projeto nao tem SMTP).
// POST { login, cpf, senha }: confere o CPF contra o termo LGPD mais recente
// do usuario (datageo-termos/<uid>/, migration 047) e grava a senha nova
// direto, sem passar por senha temporaria adivinhavel.
//
// Endpoint sem autenticacao: o que segura e o limite de tentativas, contado
// no datageo_acesso_log (so INSERT, migration 048), por login e por IP em 15
// min. Toda falha responde igual (login inexistente, sem termo, CPF errado).

import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const EMAIL_DOMINIO = 'sisater.local'
const SENHA_PREFIXO = 'dgp:'
const SENHA_MIN = 8
const ORIGENS = ['https://dgp-comando.github.io']
const JANELA_MS = 15 * 60_000
const MAX_POR_LOGIN = 5
const MAX_POR_IP = 20
const NINGUEM = '00000000-0000-0000-0000-000000000000'
const FALHA = 'Dados não conferem. Confira a matrícula (ou e-mail) e o CPF do termo que você assinou.'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

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

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')

/** Login digitado -> e-mail do Auth (mesma regra de credenciais() no front). */
export function emailDoLogin(login: string): string {
  const l = login.trim().toLowerCase()
  return l.includes('@') ? l : `${l}@${EMAIL_DOMINIO}`
}

/** Mesmas regras do passo "defina sua senha" do front. */
export function senhaInvalida(senha: string, matricula?: string): string | null {
  if (senha.length < SENHA_MIN) return `A senha precisa de pelo menos ${SENHA_MIN} caracteres.`
  if (matricula && (senha.includes(matricula) || senha.includes([...matricula].reverse().join('')))) {
    return 'A senha não pode conter a matrícula.'
  }
  return null
}

async function acharPorEmail(email: string): Promise<User | null> {
  // ponytail: varre a lista (~1,2 mil usuarios); trocar por RPC se passar de 10 mil.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const achado = data.users.find((u) => u.email === email)
    if (achado) return achado
    if (data.users.length < 1000) return null
  }
}

async function tentativas(login: string, ip: string): Promise<{ login: number; ip: number }> {
  const desde = new Date(Date.now() - JANELA_MS).toISOString()
  const conta = async (col: string, valor: string) => {
    const { count, error } = await admin.from('datageo_acesso_log')
      .select('id', { count: 'exact', head: true })
      .eq('evento', 'senha_recuperacao_falha').gte('criado_em', desde).eq(col, valor)
    if (error) throw error
    return count ?? 0
  }
  const [l, i] = await Promise.all([conta('alvo', login), conta('detalhe->>ip', ip)])
  return { login: l, ip: i }
}

async function registrar(evento: string, userId: string, login: string, ip: string) {
  const { error } = await admin.from('datageo_acesso_log').insert({
    user_id: userId, sessao_id: crypto.randomUUID(), evento, alvo: login, detalhe: { ip },
  })
  if (error) console.error(`[datageo-senha] log: ${error.message}`)
}

/** CPF do termo assinado mais recente. */
async function cpfDoTermo(userId: string): Promise<string | null> {
  const bucket = admin.storage.from('datageo-termos')
  const { data: lista, error } = await bucket.list(userId, {
    limit: 1, sortBy: { column: 'created_at', order: 'desc' },
  })
  const ultimo = !error && lista?.[0]?.name
  if (!ultimo) return null
  const { data: blob } = await bucket.download(`${userId}/${ultimo}`)
  if (!blob) return null
  return soDigitos(JSON.parse(await blob.text()).cpf) || null
}

function cpfIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  const h = { ...cors(req), 'Content-Type': 'application/json' }
  const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return resp(405, { error: 'Método não permitido' })

  try {
    const body = await req.json().catch(() => ({}))
    const login = String(body.login ?? '').trim().toLowerCase().slice(0, 120)
    const cpf = soDigitos(body.cpf)
    const senha = String(body.senha ?? '')
    if (!login || cpf.length !== 11 || !senha) return resp(400, { error: 'Informe matrícula (ou e-mail), CPF e a senha nova.' })

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido'
    const n = await tentativas(login, ip)
    if (n.login >= MAX_POR_LOGIN || n.ip >= MAX_POR_IP) {
      return resp(429, { error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' })
    }

    const user = await acharPorEmail(emailDoLogin(login))
    const cpfTermo = user && user.app_metadata?.datageo === true ? await cpfDoTermo(user.id) : null
    if (!user || !cpfTermo || !cpfIgual(cpf, cpfTermo)) {
      await registrar('senha_recuperacao_falha', user?.id ?? NINGUEM, login, ip)
      return resp(400, { error: FALHA })
    }

    const invalida = senhaInvalida(senha, user.user_metadata?.matricula)
    if (invalida) return resp(400, { error: invalida })

    const sisater = user.email?.endsWith(`@${EMAIL_DOMINIO}`)
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: sisater ? SENHA_PREFIXO + senha : senha,
      user_metadata: { ...user.user_metadata, must_change_password: false },
    })
    if (error) throw error
    await registrar('senha_recuperada', user.id, login, ip)
    return resp(200, { ok: true })
  } catch (err) {
    console.error(`[datageo-senha] ${(err as Error).message}`)
    return resp(500, { error: 'Falha no servidor. Tente de novo.' })
  }
})
