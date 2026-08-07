import React from 'react';
import Layout from '@/components/layout/Layout';
import { ShieldCheck, AlertTriangle, PackageCheck, Truck, XCircle, Mail } from 'lucide-react';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const ReturnPolicy: React.FC = () => (
  <Layout>
    <div className="py-12 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl font-bold text-foreground mb-2">Política de Devolução</h1>
        <p className="text-muted-foreground text-sm mb-10">Última atualização: junho de 2025</p>

        {/* Aviso em destaque */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-10 flex gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 leading-relaxed">
            <strong>Aviso importante:</strong> por se tratar de uma operação de produtos importados diretamente do
            Japão, a devolução por desistência ou arrependimento só é aceita caso o produto esteja totalmente
            lacrado, intacto e sem uso. O reembolso será processado exclusivamente após o recebimento e conferência
            do item em nosso centro de distribuição.
          </p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Condições para devolução</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Prazo:</strong> a solicitação de devolução deve ser realizada em até 7 (sete) dias corridos após a data de recebimento do pedido no endereço do cliente.</li>
              <li><strong>Estado do produto:</strong> o produto deve estar completamente lacrado, na embalagem original, sem qualquer sinal de uso, abertura ou violação de selos, plásticos e lacres de proteção do fabricante.</li>
              <li><strong>Restrições de higiene e segurança:</strong> cosméticos, maquiagens, itens de higiene pessoal e produtos alimentícios que tenham sido abertos, testados ou que estejam com a embalagem/lacre violado não são elegíveis para devolução sob nenhuma hipótese.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Frete de devolução</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Desistência / arrependimento:</strong> o custo do frete para envio de retorno do produto é de responsabilidade do cliente.</li>
              <li><strong>Rastreamento obrigatório:</strong> o envio de devolução deve obrigatoriamente possuir código de rastreamento para comprovação da entrega. A NikkeyBox não se responsabiliza por extravios, roubos ou avarias ocorridas durante o transporte de retorno enviado pelo cliente.</li>
              <li><strong>Erro da loja ou defeito:</strong> em casos comprovados de envio de produto incorreto ou item com defeito de fabricação, o custo do frete de devolução será totalmente assumido pela NikkeyBox.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Processo de análise e reembolso</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Conferência física:</strong> todo produto devolvido passa por uma inspeção de qualidade assim que chega ao nosso endereço.</li>
              <li><strong>Aprovação:</strong> confirmado que o produto encontra-se lacrado, intacto e em sua embalagem original, o reembolso será autorizado.</li>
              <li><strong>Prazos e métodos:</strong> o valor do produto será estornado pelo mesmo meio de pagamento utilizado na compra (PIX, PayPay ou transferência) em até 10 dias úteis após a conclusão da análise.</li>
              <li><strong>Reprovação:</strong> caso seja constatada qualquer violação do lacre, uso ou avaria no produto, a devolução não será aceita. O cliente poderá solicitar o reenvio do item mediante o pagamento do frete correspondente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Valores não reembolsáveis</h2>
            <p>
              Em devoluções solicitadas por desistência ou arrependimento do comprador, os seguintes valores
              <strong> não são reembolsáveis</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>A taxa de serviço de compra / Personal Shopper (PS).</li>
              <li>O valor do frete de envio original do pedido (do Japão para o destino).</li>
              <li>Impostos, taxas alfandegárias ou tarifas postais já pagas às autoridades do país de destino (ex.: Receita Federal).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Produtos com defeito ou avarias de transporte</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Prazo recomendado e sinistro:</strong> caso o pacote chegue com avarias visíveis causadas pelo transporte ou o produto apresente defeito de fabricação, solicitamos que entre em contato em até 48 horas após o recebimento, enviando fotos e vídeos da embalagem externa, etiqueta de envio e do produto danificado.</li>
              <li><strong>Nota legal:</strong> o prazo de 48 horas é o exigido pelas transportadoras para abertura de sinistro e acionamento do seguro de transporte, mas ele não substitui nem reduz os prazos de reclamação garantidos ao consumidor no Brasil pelo Código de Defesa do Consumidor (Lei nº 8.078/1990, art. 26).</li>
              <li><strong>Procedimento:</strong> cada caso será avaliado individualmente para providenciarmos o reenvio do item ou o reembolso integral, sem custos de frete para o cliente em casos de responsabilidade da loja ou avaria comprovada no transporte.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Como solicitar uma devolução</h2>
            <p>
              Para iniciar o processo de devolução ou relatar um problema com seu pedido, entre em contato através
              dos nossos canais oficiais informando o número do pedido, nome completo e o motivo da solicitação:
            </p>
            <ul className="list-none mt-3 space-y-1">
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
              <li>📍 Endereço operacional: {COMPANY_PROFILE.fulfillmentOrigin.formatted} 🇯🇵</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  </Layout>
);

export default ReturnPolicy;
