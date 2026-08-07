import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const PrivacyPolicy: React.FC = () => (
  <Layout>
    <div className="py-12 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl font-bold text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground text-sm mb-10">Última atualização: junho de 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Quem somos</h2>
            <p>
              A <strong>{COMPANY_PROFILE.brand}</strong> é uma loja de produtos importados do Japão, operada por
              <strong> {COMPANY_PROFILE.contactName}</strong>, estabelecida em <strong>{COMPANY_PROFILE.fulfillmentOrigin.formatted}</strong>.
              Operamos o site <strong>nikkeybox-store.com</strong> e tratamos os dados dos nossos clientes
              com transparência e responsabilidade, em conformidade com a Lei Geral de Proteção de Dados (LGPD —
              Lei nº 13.709/2018).
            </p>
            <p className="mt-2">
              Contato do responsável pelos dados: <a href={`mailto:${COMPANY_PROFILE.email}`} className="text-primary hover:underline">{COMPANY_PROFILE.email}</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Quais dados coletamos</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada de forma criptografada).</li>
              <li><strong>Dados de entrega:</strong> endereço completo, CEP, cidade, estado/prefeitura e telefone de contato.</li>
              <li><strong>Dados de pedido:</strong> produtos adquiridos, valores, método de pagamento selecionado e status do pedido.</li>
              <li><strong>Dados de navegação:</strong> páginas visitadas, tempo de sessão e dispositivo — coletados anonimamente via Firebase Analytics, somente após seu consentimento no banner de cookies.</li>
            </ul>
            <p className="mt-3">
              <strong>Importante:</strong> não coletamos nem armazenamos dados de cartão de crédito em nossos servidores.
              Pagamentos via PIX e PayPay são processados externamente por plataformas seguras.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Como usamos seus dados</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Processar, faturar e entregar seus pedidos.</li>
              <li>Enviar confirmações de compra, atualizações de status e rastreamento por e-mail e WhatsApp.</li>
              <li>Melhorar nossa linha de produtos, atendimento e a experiência de navegação no site.</li>
              <li>Cumprir obrigações legais, fiscais e regulatórias do comércio internacional.</li>
              <li>Prevenir fraudes e garantir a segurança cibernética da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Base legal para o tratamento (LGPD)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Execução de contrato</strong> — para processar compras, pagamentos e entregas.</li>
              <li><strong>Consentimento</strong> — para uso de cookies analíticos e comunicações de marketing.</li>
              <li><strong>Interesse legítimo</strong> — para prevenção de fraudes e melhorias na plataforma.</li>
              <li><strong>Obrigação legal</strong> — para emissão de documentos e registros fiscais.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Compartilhamento de dados</h2>
            <p>Seus dados são compartilhados estritamente com parceiros necessários para a prestação do serviço:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>Google Firebase</strong> — banco de dados, autenticação de conta e métricas analíticas.
                Os servidores seguem padrões internacionais de segurança, e a transferência internacional de dados
                é amparada por cláusulas contratuais padrão, conforme o art. 33 da LGPD.
              </li>
              <li><strong>Resend</strong> — plataforma técnica para envio de e-mails transacionais (confirmação de pedidos e rastreamento).</li>
              <li><strong>Japan Post / Correios / transportadoras</strong> — para a realização da entrega física dos produtos.</li>
            </ul>
            <p className="mt-3">Jamais vendemos ou comercializamos seus dados pessoais com terceiros.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Seus direitos (LGPD)</h2>
            <p>Como titular dos dados, você pode solicitar a qualquer momento:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Confirmar e acessar os dados pessoais que mantemos sobre você.</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
              <li>Solicitar a exclusão ou anonimização de seus dados de nossa base.</li>
              <li>Solicitar a portabilidade dos dados para outro fornecedor.</li>
              <li>Revogar o consentimento previamente dado para cookies analíticos.</li>
            </ul>
            <p className="mt-3">
              Para exercer seus direitos, entre em contato via e-mail em <a href={`mailto:${COMPANY_PROFILE.email}`} className="text-primary hover:underline">{COMPANY_PROFILE.email}</a>.
              Responderemos em até 15 dias úteis.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Cookies</h2>
            <p>
              Utilizamos cookies essenciais (necessários para o funcionamento correto do carrinho e login) e
              cookies analíticos (somente com o seu consentimento prévio). Veja nossa <Link to="/cookies" className="text-primary hover:underline">Política de Cookies</Link> para mais detalhes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Retenção de dados</h2>
            <p>
              Mantemos seus dados pessoais apenas pelo tempo necessário para cumprir as finalidades desta política
              ou conforme exigido pela legislação aplicável (em geral, 5 anos para registros fiscais e contábeis).
              Contas inativas há mais de 2 anos poderão ser anonimizadas ou excluídas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais avançadas para proteger suas informações, incluindo
              criptografia de navegação (HTTPS/SSL), autenticação segura com Firebase e controle estrito de acesso
              ao painel administrativo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Alterações nesta política</h2>
            <p>
              Podemos atualizar esta política periodicamente para refletir melhorias em nossos processos.
              Alterações relevantes serão notificadas via e-mail ou por aviso em nosso site. A data de última
              atualização sempre estará indicada no topo desta página.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contato</h2>
            <p>Para dúvidas sobre privacidade e proteção de dados:</p>
            <ul className="list-none mt-2 space-y-1">
              <li>📧 E-mail: <a href={`mailto:${COMPANY_PROFILE.email}`} className="text-primary hover:underline">{COMPANY_PROFILE.email}</a></li>
              <li>
                💬 WhatsApp:{' '}
                <a
                  href={`https://wa.me/${COMPANY_PROFILE.whatsapp.digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {COMPANY_PROFILE.whatsapp.international}
                </a>
              </li>
              <li>📍 Endereço: {COMPANY_PROFILE.fulfillmentOrigin.formatted} 🇯🇵</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  </Layout>
);

export default PrivacyPolicy;
