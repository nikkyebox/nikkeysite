import React from 'react';
import CinematicHeroShelf from '@/components/home/CinematicHeroShelf';

/**
 * Hero padrão: travelling da loja seguido pela vinheta NikkeyBox em um
 * crossfade de dois segundos.
 */
const CinematicHeroShelfTransition: React.FC = () => (
  <CinematicHeroShelf introVariant="transition" />
);

export default CinematicHeroShelfTransition;
