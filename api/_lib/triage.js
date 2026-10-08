import { choice, TypeSafeClient } from '@typesafe-ai/sdk';

// Triagem consultiva de pedidos personalizados com o Jev (TypeSafe AI).
// Sem TYPESAFE_API_KEY a triagem é desligada e o pedido segue normalmente.
// Erros do Jev lançam; quem chama decide não bloquear o envio do cliente.
export async function triageCustomRequest(data) {
  if (!process.env.TYPESAFE_API_KEY) return null;

  const client = new TypeSafeClient();
  const response = await client.systemOne({
    state: {
      document: [
        `Produto pedido: ${data.productDesc}`,
        `Quantidade: ${data.quantity || 'não informada'}`,
        `País: ${data.country || 'não informado'}`,
      ].join('\n'),
    },
    questions: {
      category: choice('Qual o tipo de pedido?', {
        alimento: null,
        cosmetico: null,
        eletronico: null,
        outro: null,
      }),
      urgency: choice('Qual a urgência para a loja responder?', {
        alta: null,
        media: null,
        baixa: null,
      }),
    },
  });

  return {
    category: response.answers.category.choice,
    urgency: response.answers.urgency.choice,
  };
}
