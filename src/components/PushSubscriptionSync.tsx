// Sem UI: só reconcilia a inscrição de push do aparelho ao abrir o app.
//
// Motivo de existir no nível do app, e não na tela de perfil onde fica o botão
// de ativar: quando o registro em '/push/' se perde, o cliente não tem como
// saber — o botão continua marcado como ativo, o painel conta o aparelho em
// "vão receber push de verdade", o provedor aceita o envio com HTTP 201 e nada
// aparece na tela. Se a recuperação dependesse de visitar o perfil, a
// notificação seguiria muda por semanas.
//
// Roda uma vez por sessão de app, e só quando a permissão já está concedida:
// `pushService.resync` não abre diálogo nenhum.
import { useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { pushService } from '@/services/pushService';

const PushSubscriptionSync: React.FC = () => {
  const { user, authReady } = useUser();
  const jaRodou = useRef('');

  useEffect(() => {
    const email = user?.email;
    if (!authReady || !email) return;
    if (jaRodou.current === email) return;
    jaRodou.current = email;
    void pushService.resync({ email, name: user?.name });
  }, [authReady, user?.email, user?.name]);

  return null;
};

export default PushSubscriptionSync;
