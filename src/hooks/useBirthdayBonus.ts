import { useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/hooks/use-toast';
import { userRewardsService } from '@/services/userRewardsService';

/**
 * No aniversário do cliente, concede 1000 pontos (uma vez por ano),
 * mostra mensagem de feliz aniversário e notifica o ganho.
 */
export function useBirthdayBonus() {
  const { user, isAuthenticated, addPoints, updateProfile } = useUser();
  const { toast } = useToast();
  const checked = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.birthdate || checked.current) return;

    const todayParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
    );
    const birthday = /^(?:\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(user.birthdate);
    if (!birthday) return;

    const year = Number(todayParts.year);
    const isBirthday =
      Number(birthday[1]) === Number(todayParts.month)
      && Number(birthday[2]) === Number(todayParts.day);
    if (!isBirthday || user.birthdayBonusYear === year) return;

    checked.current = true;
    void userRewardsService.claimBirthday().then((reward) => {
      if (reward.awarded <= 0) return;
      addPoints(reward.awarded);
      updateProfile({ birthdayBonusYear: year });
      toast({
        title: 'Feliz aniversário, ' + (user.name?.split(' ')[0] || '') + '!',
        description: `Você ganhou ${reward.awarded} pontos (¥${reward.awarded}) para usar na sua próxima compra.`,
        duration: 10000,
      });
    }).catch(() => {
      // O servidor é a autoridade para data e idempotência; falhas não concedem pontos locais.
    });
  }, [isAuthenticated, user, addPoints, updateProfile, toast]);
}
