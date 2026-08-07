import React from 'react';
import { cn } from '@/lib/utils';

// ISO 3166-1 alpha-2 country codes for flags
// Uses flagcdn.com — works in all browsers (Chrome, Firefox, Safari)
interface FlagIconProps {
  code: string; // e.g. 'br', 'us', 'jp'
  alt?: string;
  size?: number;
  className?: string;
}

const FlagIcon: React.FC<FlagIconProps> = ({ code, alt, size = 24, className }) => {
  const lower = code.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w${size}/${lower}.png`}
      srcSet={`https://flagcdn.com/w${size * 2}/${lower}.png 2x`}
      width={size}
      height={Math.round(size * 0.667)}
      alt={alt || code.toUpperCase()}
      className={cn('inline-block rounded-[2px] object-cover', className)}
    />
  );
};

export default FlagIcon;
