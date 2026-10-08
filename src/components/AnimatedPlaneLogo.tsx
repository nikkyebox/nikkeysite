import React from 'react';

interface AnimatedPlaneLogoProps {
  size?: number;
  className?: string;
  imageClassName?: string;
  alt?: string;
}

/**
 * Logo NikkeyBox estático. A animação antiga (vídeo de avião do site japanexpress)
 * foi removida: o arquivo pwa-logo-transition.mp4 nem existe mais no projeto.
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
    className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-primary ${className}`}
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
  </div>
);

export default AnimatedPlaneLogo;
