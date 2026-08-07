import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const TermsOfService: React.FC = () => (
  <Layout>
    <div className="py-12 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl font-bold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-muted-foreground text-sm mb-10">Última atualização: junho de 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Aceitação dos termos</h2>
            <p>
              Ao acessar ou utilizar o site <strong>nikkeybox-store.com</strong>, você concorda em cumprir estes
              Termos de Uso. Caso não concorde com qualquer disposição aqui contida, solicitamos que não continue
              a utilizar o site. Estes termos aplicam-se a todos os visitantes, clientes e usuários cadastrados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Sobre a NikkeyBox</h2>
            <p>
              A <strong>{COMPANY_PROFILE.brand}</strong> é uma loja online especializada em produtos originais
              importados do Japão (cosméticos, doces, papelaria, acessórios e outros), operada por
              <strong> {COMPANY_PROFILE.contactName}</strong> a partir de <strong>{COMPANY_PROFILE.fulfillmentOrigin.formatted}</strong>.
            </p>
            <p className="mt-3">
              <strong>Aviso de venda internacional:</strong> todos os pedidos são enviados diretamente do Japão e
              estão sujeitos a fiscalização alfandegária, eventuais tributos de importação e taxas cobradas pelas
              autoridades do país de destino (como a Receita Federal do Brasil).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Cadastro e conta</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>O usuário compromete-se a fornecer informações exatas, atualizadas e completas no momento do cadastro.</li>
              <li>A guarda e o sigilo da senha de acesso são de responsabilidade exclusiva do usuário.</li>
              <li>Menores de 18 anos devem obter autorização expressa dos pais ou responsáveis legais antes de efetuar compras.</li>
              <li>Reservamo-nos o direito de suspender ou encerrar contas que apresentem atividades suspeitas, inconsistentes ou fraudulentas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Produtos e preços</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Os preços podem ser exibidos na moeda selecionada pelo usuário (BRL, JPY ou EUR).</li>
              <li>As imagens exibidas no site são meramente ilustrativas; pequenas variações na embalagem ou no design podem ocorrer por atualizações dos fabricantes no Japão.</li>
              <li>Reservamo-nos o direito de alterar os preços dos produtos a qualquer momento, sem aviso prévio.</li>
              <li>Em caso de erro crasso e evidente de precificação no sistema, o pedido poderá ser cancelado pela administração com o devido reembolso integral do valor pago.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Pedidos e pagamento</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Os pedidos são processados e confirmados somente após a validação do pagamento integral (PIX, PayPay ou transferência).</li>
              <li>Após a realização do pedido, o cliente deve enviar o comprovante de pagamento via WhatsApp no número <strong>{COMPANY_PROFILE.whatsapp.international}</strong>.</li>
              <li>O prazo de processamento e separação do pedido é de até 2 dias úteis após a confirmação do pagamento.</li>
              <li>O preenchimento correto do endereço de entrega é de responsabilidade do cliente. Pedidos devolvidos por inconsistência no endereço não terão o valor do frete reembolsado.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Frete e entrega</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>O valor do frete é calculado com base no peso total, dimensões do pacote e país de destino.</li>
              <li>Os prazos informados no checkout são estimativas baseadas nos dados dos Correios do Japão e do país de destino. A NikkeyBox não se responsabiliza por atrasos decorrentes de greves, intempéries climáticas, retenções alfandegárias ou trâmites operacionais da Receita Federal.</li>
              <li><strong>Taxas de importação:</strong> eventuais impostos de importação, tarifas postais ou taxas de despacho cobradas no país de destino são de responsabilidade exclusiva do cliente comprador.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Trocas e devoluções</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>O cliente possui o prazo de até 7 (sete) dias corridos, contados a partir da data de recebimento do produto, para solicitar a devolução por desistência ou arrependimento.</li>
              <li><strong>Condição obrigatória:</strong> por se tratar de importação de itens de uso pessoal, o produto deve estar completamente lacrado, na embalagem original, sem uso e sem avarias. Produtos alimentícios e cosméticos com embalagem aberta ou violada não são elegíveis para devolução por razões de segurança sanitária.</li>
              <li>Em caso de desistência ou arrependimento, o custo do frete de retorno é de responsabilidade do cliente. Em casos comprovados de produto com defeito de fabricação ou erro no envio cometido pela loja, o frete de devolução será custeado pela NikkeyBox.</li>
              <li>Para iniciar o processo, entre em contato via WhatsApp ou e-mail com foto do produto.</li>
              <li>As condições completas, incluindo o processo de reembolso e o que não é reembolsável, estão na <Link to="/devolucao" className="text-primary hover:underline">Política de Devolução</Link>, que prevalece em caso de divergência com este resumo.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Propriedade intelectual</h2>
            <p>
              Todo o conteúdo disponível no site <strong>nikkeybox-store.com</strong> — incluindo textos, fotos,
              marcas, logotipos, layouts e ilustrações — é de propriedade da NikkeyBox ou devidamente licenciado.
              É estritamente proibida a cópia, reprodução, alteração ou uso comercial desse material sem autorização
              prévia por escrito.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitação de responsabilidade</h2>
            <p>
              A NikkeyBox atua em conformidade com as normas de comércio e defesa do consumidor. A
              responsabilidade máxima da loja limita-se ao valor total pago pelo cliente pelo produto e frete
              correspondente ao pedido em questão.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Lei aplicável e foro</h2>
            <p>
              Estes Termos de Uso são regidos pela legislação aplicável às vendas ao consumidor. Eventuais
              controvérsias com consumidores residentes no Brasil serão submetidas ao foro do domicílio do
              consumidor, em conformidade com o Código de Defesa do Consumidor (Lei nº 8.078/1990).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contato</h2>
            <ul className="list-none space-y-1">
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
              <li>📍 Localização: {COMPANY_PROFILE.fulfillmentOrigin.shortPt} 🇯🇵</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  </Layout>
);

export default TermsOfService;
