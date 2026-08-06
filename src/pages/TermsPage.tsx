// src/pages/TermsPage.tsx
import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto card p-8 prose prose-invert">
        <Link to="/" className="text-accent-blue text-sm hover:underline">← Voltar</Link>
        <h1 className="text-2xl font-bold text-text-primary mt-4">Termos de Uso</h1>
        <p className="text-text-muted text-xs">Última atualização: 19/05/2026</p>

        <h2 className="text-lg text-text-primary mt-6">1. Aceitação</h2>
        <p className="text-text-secondary text-sm">
          Ao criar uma conta no DataGeo PR (“Serviço”) você concorda com estes Termos
          e com a <Link to="/legal/privacidade" className="text-accent-blue">Política de Privacidade</Link>.
          Se não concordar, não utilize o Serviço.
        </p>

        <h2 className="text-lg text-text-primary mt-6">2. Sobre o Serviço</h2>
        <p className="text-text-secondary text-sm">
          O DataGeo PR oferece API REST e console web com dados públicos consolidados
          (INMET, SIDRA/IBGE, InfoDengue, NASA FIRMS, ANA, CEMADEN, DataSUS, ALEP, entre
          outros) sobre os 399 municípios do Paraná. Os dados são fornecidos “no estado em
          que se encontram” a partir das fontes originais; eventuais lacunas, atrasos ou
          erros das fontes podem se refletir no Serviço.
        </p>

        <h2 className="text-lg text-text-primary mt-6">3. Conta, planos e cobrança</h2>
        <p className="text-text-secondary text-sm">
          O Free tier não exige cartão. Os planos pagos são cobrados mensalmente em BRL via
          Stripe. Você pode cancelar a qualquer momento pelo portal de assinatura;
          o acesso permanece ativo até o fim do período já pago. Não há reembolso de
          períodos parciais.
        </p>

        <h2 className="text-lg text-text-primary mt-6">4. Uso aceitável da API</h2>
        <ul className="text-text-secondary text-sm list-disc pl-5">
          <li>Respeite a cota do seu plano. Excedentes podem ser cobrados ou bloqueados.</li>
          <li>Não tente derrubar, fazer engenharia reversa ou abusar do Serviço.</li>
          <li>Não republique os dados em massa como se fossem seus — cite a fonte (DataGeo PR + a fonte primária).</li>
          <li>Não use o Serviço para finalidade ilegal, discriminatória ou que viole a LGPD.</li>
        </ul>

        <h2 className="text-lg text-text-primary mt-6">5. Propriedade intelectual</h2>
        <p className="text-text-secondary text-sm">
          O código de cliente, o console, o desenho da API e os índices derivados (ex.: IRTC)
          são propriedade do DataGeo PR. Os dados primários permanecem dos seus respectivos
          detentores.
        </p>

        <h2 className="text-lg text-text-primary mt-6">6. Limitação de responsabilidade</h2>
        <p className="text-text-secondary text-sm">
          O Serviço não substitui sistemas oficiais de Defesa Civil. Não nos
          responsabilizamos por decisões tomadas exclusivamente com base nos dados.
          Em caso de falha, a responsabilidade máxima limita-se ao valor pago nos
          últimos 12 meses pelo cliente.
        </p>

        <h2 className="text-lg text-text-primary mt-6">7. Encerramento</h2>
        <p className="text-text-secondary text-sm">
          Podemos suspender contas que violem estes Termos. Você pode encerrar sua conta
          a qualquer momento; dados de billing são retidos pelo prazo legal.
        </p>

        <h2 className="text-lg text-text-primary mt-6">8. Foro</h2>
        <p className="text-text-secondary text-sm">
          Aplica-se a legislação brasileira; foro da comarca de Curitiba/PR.
        </p>

        <p className="text-text-muted text-xs mt-6">
          Dúvidas: <a href="mailto:contato@datageoparana.com.br" className="text-accent-blue">contato@datageoparana.com.br</a>
        </p>
      </div>
    </div>
  )
}
