import React from 'react';

interface Props {
  size?: number;
  className?: string;
}

// Logo "NikkeyBox" — ícone de caixa/presente em círculo com gradiente roxo
// (public/logo.jpg), identidade própria, distinta da marca anterior.
const NikkeyBoxLogo: React.FC<Props> = ({ size = 48, className = '' }) => (
  <img
    src="/logo.jpg"
    alt="NikkeyBox"
    width={size}
    height={size}
    className={`rounded-full object-cover shadow-lg border-2 border-primary/10 ${className}`}
  />
);

export default NikkeyBoxLogo;
