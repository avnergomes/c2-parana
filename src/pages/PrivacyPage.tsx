// src/pages/PrivacyPage.tsx
import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto card p-8 prose prose-invert">
        <Link to="/" className="text-accent-blue text-sm hover:underline">← Voltar</Link>
        <h1 className="text-2xl font-bold text-text-primary mt-4">Política de Privacidade</h1>
        <p className="text-text-muted text-xs">Última atualização: 19/05/2026 — em conformidade com a LGPD (Lei 13.709/2018)</p>

        <h2 className="text-lg text-text-primary mt-6">1. Controlador</h2>
        <p className="text-text-secondary text-sm">
          DataGeo PR — contato:{' '}
          <a href="mailto:contato@datageoparana.com.br" className="text-accent-blue">
            contato@datageoparana.com.br
          </a>.
        </p>

        <h2 className="text-lg text-text-primary mt-6">2. Quais dados coletamos</h2>
        <ul className="text-text-secondary text-sm list-disc pl-5">
          <li><strong>Conta:</strong> nome, e-mail, hash de senha (gerenciado pelo Supabase Auth).</li>
          <li><strong>Assinatura:</strong> ID Stripe do cliente; <em>não</em> armazenamos número de cartão.</li>
          <li><strong>Uso da API:</strong> timestamp, endpoint, chave usada, status — para enforcement de cota e segurança.</li>
          <li><strong>Logs técnicos:</strong> IP e User-Agent das chamadas autenticadas (retenção: 30 dias).</li>
        </ul>

        <h2 className="text-lg text-text-primary mt-6">3. Base legal</h2>
        <p className="text-text-secondary text-sm">
          Execução de contrato (art. 7º V), cumprimento de obrigação legal/fiscal (art. 7º II)
          e legítimo interesse para segurança e prevenção a fraude (art. 7º IX).
        </p>

        <h2 className="text-lg text-text-primary mt-6">4. Compartilhamento</h2>
        <p className="text-text-secondary text-sm">
          Dados são processados em: <strong>Supabase</strong> (banco e auth), <strong>Stripe</strong>
          (pagamentos), <strong>Sentry</strong> (monitoramento de erros) e o provedor de hospedagem
          do front. Não vendemos dados a terceiros.
        </p>

        <h2 className="text-lg text-text-primary mt-6">5. Cookies e analytics</h2>
        <p className="text-text-secondary text-sm">
          Usamos apenas cookies estritamente necessários (sessão Supabase). Caso ativemos
          analytics no futuro, exibiremos banner de consentimento antes de qualquer carga.
        </p>

        <h2 className="text-lg text-text-primary mt-6">6. Seus direitos (art. 18 LGPD)</h2>
        <p className="text-text-secondary text-sm">
          Você pode solicitar a qualquer momento: confirmação, acesso, correção,
          anonimização, portabilidade, eliminação, informação sobre compartilhamento e
          revogação de consentimento. Envie e-mail para{' '}
          <a href="mailto:privacidade@datageoparana.com.br" className="text-accent-blue">
            privacidade@datageoparana.com.br
          </a>{' '}
          — respondemos em até 15 dias.
        </p>

        <h2 className="text-lg text-text-primary mt-6">7. Retenção</h2>
        <p className="text-text-secondary text-sm">
          Conta: enquanto ativa + 6 meses após o encerramento. Faturamento: 5 anos
          (obrigação fiscal). Logs de API: 30 dias.
        </p>

        <h2 className="text-lg text-text-primary mt-6">8. Encarregado (DPO)</h2>
        <p className="text-text-secondary text-sm">
          A definir e nomear formalmente antes do primeiro cliente corporativo.
        </p>

        <p className="text-text-muted text-xs mt-6">
          Veja também os{' '}
          <Link to="/legal/termos" className="text-accent-blue">Termos de Uso</Link>.
        </p>
      </div>
    </div>
  )
}
