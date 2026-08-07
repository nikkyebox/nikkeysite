import React from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Lock } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/context/LanguageContext';

const MaintenancePage: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-pink-100 via-pink-50 to-white flex items-center justify-center px-4">
      {/* Language selector */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Main content */}
      <div className="text-center max-w-md space-y-6 relative z-10">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="w-12 h-12 text-primary" />
          </div>
        </div>

        <h1 className="font-display text-4xl font-bold text-foreground">{t('maintenance.title')}</h1>

        <p className="text-lg text-muted-foreground leading-relaxed">
          {t('maintenance.description')} 🎨
        </p>

        <div className="bg-card rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">
            {t('maintenance.card')} ✨
          </p>
        </div>

        {/* Acesso administrativo — nunca trava o admin do lado de fora */}
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-primary transition-colors"
        >
          <Lock className="w-3 h-3" /> {t('maintenance.admin')}
        </Link>
      </div>

      {/* Flight illustration — Japan → Brazil */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-2 pointer-events-none select-none">
        <svg
          viewBox="0 0 520 160"
          className="w-full max-w-3xl"
          style={{ opacity: 0.72 }}
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Dashed flight arc: Japan (right) → Brazil (left) */}
          <path
            id="route"
            d="M468,118 C428,14 92,14 52,118"
            fill="none"
            stroke="#e879f9"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />

          {/* Japan marker */}
          <circle cx="468" cy="118" r="21" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.5" />
          <circle cx="468" cy="118" r="8" fill="#ef4444" />
          <text x="468" y="147" textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="sans-serif">日本</text>

          {/* Brazil marker */}
          <circle cx="52" cy="118" r="21" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5" />
          <polygon points="52,110 61,118 52,126 43,118" fill="#22c55e" />
          <text x="52" y="147" textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="sans-serif">Brasil</text>

          {/* Delivery person next to Brazil circle */}
          <g stroke="#b0b8c4" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* head */}
            <circle cx="100" cy="70" r="7" />
            {/* hat brim */}
            <rect x="93" y="61" width="14" height="4" rx="2" fill="#b0b8c4" stroke="none" />
            {/* hat top */}
            <rect x="95" y="57" width="10" height="5" rx="1.5" fill="#b0b8c4" stroke="none" />
            {/* body */}
            <line x1="100" y1="77" x2="100" y2="100" />
            {/* left arm down */}
            <line x1="100" y1="84" x2="84" y2="93" />
            {/* right arm raised holding package */}
            <line x1="100" y1="84" x2="116" y2="75" />
            {/* legs */}
            <line x1="100" y1="100" x2="91" y2="117" />
            <line x1="100" y1="100" x2="109" y2="117" />
            {/* feet */}
            <line x1="91" y1="117" x2="84" y2="117" />
            <line x1="109" y1="117" x2="116" y2="117" />
          </g>

          {/* Package held by delivery person */}
          <g stroke="#fbbf24" strokeWidth="1.5" fill="none">
            <rect x="117" y="66" width="14" height="13" rx="1.5" />
            {/* ribbon vertical */}
            <line x1="124" y1="66" x2="124" y2="79" />
            {/* ribbon horizontal */}
            <line x1="117" y1="72.5" x2="131" y2="72.5" />
          </g>

          {/* Animated airplane — scaled up 2× so it's clearly visible */}
          <g>
            <g fill="#a78bfa" transform="scale(2)">
              {/* fuselage */}
              <path d="M10,0 L-5,-3 L-8,-1 L-3,0 L-8,1 L-5,3 Z" />
              {/* top wing */}
              <path d="M1,-3 L5,-10 L-3,-3 Z" />
              {/* bottom wing */}
              <path d="M1,3 L5,10 L-3,3 Z" />
              {/* tail top */}
              <path d="M-5,-3 L-9,-7 L-5,-1 Z" />
              {/* tail bottom */}
              <path d="M-5,3 L-9,7 L-5,1 Z" />
            </g>
            <animateMotion begin="0s" dur="7s" repeatCount="indefinite" rotate="auto">
              {/* eslint-disable-next-line react/no-unknown-property */}
              <mpath href="#route" xlinkHref="#route" />
            </animateMotion>
          </g>
        </svg>
      </div>
    </div>
  );
};

export default MaintenancePage;
