import React from 'react';
import Layout from '@/components/layout/Layout';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const CookiePolicy: React.FC = () => (
  <Layout>
    <div className="py-12 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl font-bold text-foreground mb-2">Política de Cookies</h1>
        <p className="text-muted-foreground text-sm mb-10">Última atualização: junho de 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">O que são cookies?</h2>
            <p>
              Cookies são pequenos arquivos de texto armazenados no seu dispositivo quando você visita um site.
              Eles permitem que o site "lembre" suas preferências e ações ao longo do tempo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Quais cookies usamos</h2>

            <div className="space-y-5 mt-2">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
                <h3 className="font-semibold text-green-800 dark:text-green-300 mb-1">✅ Cookies Essenciais — sempre ativos</h3>
                <p className="text-sm">Necessários para o funcionamento básico do site. Sem eles, funcionalidades como carrinho, login e configurações de idioma não funcionam.</p>
                <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                  <li><code>japan-express-users</code> — dados de conta do usuário (localStorage)</li>
                  <li><code>cart</code> — itens no carrinho (localStorage)</li>
                  <li><code>loginAs</code> — modo de sessão admin/cliente</li>
                  <li><code>maintenance_state</code> — status de manutenção do site</li>
                  <li><code>cookie_consent</code> — registro da sua escolha de consentimento</li>
                  <li><code>pwa_install_dismissed</code> — se você fechou o banner de instalação do app</li>
                </ul>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-1">📊 Cookies Analíticos — com seu consentimento</h3>
                <p className="text-sm">Nos ajudam a entender como os visitantes usam o site, para que possamos melhorá-lo.</p>
                <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                  <li><strong>Firebase Analytics</strong> (Google) — páginas visitadas, eventos de clique, sessões. Dados anonimizados e sem informações pessoais identificáveis.</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">Ativados somente após você clicar em "Aceitar" no banner de cookies.</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700 rounded-xl">
                <h3 className="font-semibold text-foreground mb-1">🔧 Armazenamento local (localStorage)</h3>
                <p className="text-sm">Além de cookies, usamos <em>localStorage</em> do navegador para armazenar preferências localmente. Estes dados nunca são enviados automaticamente a servidores externos.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Como gerenciar cookies</h2>
            <p>Você pode gerenciar ou recusar cookies analíticos de duas formas:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Banner de consentimento:</strong> clique em "Recusar" quando o banner aparecer.</li>
              <li><strong>Navegador:</strong> nas configurações do seu navegador, você pode bloquear ou deletar cookies. Consulte a ajuda do seu navegador para instruções específicas.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">⚠️ Desativar cookies essenciais pode prejudicar o funcionamento do site, incluindo login e carrinho de compras.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Cookies de terceiros</h2>
            <p>Alguns serviços que utilizamos podem definir seus próprios cookies:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Google Firebase</strong> — <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política de Privacidade do Google</a></li>
              <li><strong>YouTube</strong> (vídeos incorporados no Vlog) — <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política do YouTube</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Contato</h2>
            <p>Para dúvidas sobre cookies e privacidade:</p>
            <ul className="list-none mt-2 space-y-1">
              <li>📧 <a href={`mailto:${COMPANY_PROFILE.email}`} className="text-primary hover:underline">{COMPANY_PROFILE.email}</a></li>
              <li>💬 WhatsApp: {COMPANY_PROFILE.whatsapp.international}</li>
              <li>📍 {COMPANY_PROFILE.fulfillmentOrigin.shortPt} 🇯🇵</li>
            </ul>
            <p className="mt-3">
              {COMPANY_PROFILE.brand} é operada por <strong>{COMPANY_PROFILE.contactName}</strong> a partir do Japão.
            </p>
          </section>

        </div>
      </div>
    </div>
  </Layout>
);

export default CookiePolicy;
