import React, { useEffect, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/hooks/use-toast';
import { socialFollowService, SocialNetwork, SOCIAL_CONFIG, SOCIAL_POINTS } from '@/services/socialFollowService';
import { useLanguage } from '@/context/LanguageContext';

const SocialFollowRewards: React.FC = () => {
  const { user, addPoints } = useUser();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [followed, setFollowed] = useState<Partial<Record<SocialNetwork, boolean>>>({});
  const [opened, setOpened] = useState<Partial<Record<SocialNetwork, boolean>>>({});
  const [loading, setLoading] = useState<SocialNetwork | null>(null);

  useEffect(() => {
    if (user?.id) socialFollowService.getFollowedNetworks(user.id).then(setFollowed);
  }, [user?.id]);

  const handleOpen = (net: SocialNetwork) => {
    window.open(SOCIAL_CONFIG[net].url, '_blank');
    setOpened(o => ({ ...o, [net]: true }));
  };

  const handleConfirm = async (net: SocialNetwork) => {
    if (!user?.id) return;
    setLoading(net);
    const { ok, alreadyClaimed } = await socialFollowService.confirmFollow(user.id, net);
    if (alreadyClaimed) {
      toast({ title: t('social.followed'), description: `+${SOCIAL_POINTS} pts — ${SOCIAL_CONFIG[net].label}` });
    } else if (ok) {
      addPoints(SOCIAL_POINTS);
      setFollowed(f => ({ ...f, [net]: true }));
      toast({ title: `+${SOCIAL_POINTS} pts!`, description: `${SOCIAL_CONFIG[net].label} 🎉` });
    } else {
      toast({ title: 'Error', description: 'Try again.', variant: 'destructive' });
    }
    setLoading(null);
  };

  const networks = Object.entries(SOCIAL_CONFIG) as [SocialNetwork, typeof SOCIAL_CONFIG[SocialNetwork]][];
  const totalEarnable = networks.filter(([net]) => !followed[net]).length * SOCIAL_POINTS;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-foreground">{t('social.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('social.desc').replace('{pts}', String(SOCIAL_POINTS))}</p>
        </div>
        {totalEarnable > 0 && (
          <span className="text-xs font-bold bg-pink-100 text-pink-700 px-2.5 py-1 rounded-full">
            {t('social.available').replace('{pts}', String(totalEarnable))}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {networks.map(([net, cfg]) => (
          <div key={net} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full ${cfg.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {cfg.label[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{cfg.label}</p>
                <p className="text-xs text-muted-foreground">+{SOCIAL_POINTS} pts</p>
              </div>
            </div>
            {followed[net] ? (
              <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                <Check className="w-3.5 h-3.5" /> {t('social.followed')}
              </span>
            ) : opened[net] ? (
              <Button size="sm" className="text-xs h-7 px-3" onClick={() => handleConfirm(net)} disabled={loading === net}>
                {loading === net ? '...' : t('social.confirm')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="text-xs h-7 px-3 gap-1" onClick={() => handleOpen(net)}>
                {t('social.follow')} <ExternalLink className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SocialFollowRewards;
