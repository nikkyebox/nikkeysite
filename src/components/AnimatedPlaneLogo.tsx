import React from 'react';

interface AnimatedPlaneLogoProps {
  size?: number;
  className?: string;
  imageClassName?: string;
  alt?: string;
}

/**
 * Recorte leve da vinheta do hero transition. O ícone nativo instalado continua
 * estático por limitação do Android/iOS; a experiência web/PWA usa a animação real.
 */
const AnimatedPlaneLogo: React.FC<AnimatedPlaneLogoProps> = ({
  size = 48,
  className = '',
  imageClassName = '',
  alt = 'NikkeyBox',
}) => (
  <div
    role="img"
    aria-label={alt}
    className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-pink-500 ${className}`}
    style={{ width: size, height: size }}
  >
    <img
      src="/icons/logo-complete-384x384.png?v=9"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={`h-full w-full object-cover ${imageClassName}`}
    />
    <video
      src="/videos/pwa-logo-transition.mp4"
      poster="/icons/logo-complete-384x384.png?v=9"
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full object-cover motion-reduce:hidden ${imageClassName}`}
    />
  </div>
);

export default AnimatedPlaneLogo;
