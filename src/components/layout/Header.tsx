import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

/**
 * Header minimalista, visível só no mobile (< md): logo + botão que abre a
 * Sidebar como gaveta. A partir de md, a Sidebar já fica fixa e visível
 * sozinha (ver Sidebar.tsx), então este header não precisa aparecer.
 */
const Header: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-xl md:hidden">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="group flex shrink-0 items-center" aria-label="NikkeyBox — início">
            <div className="flex flex-col leading-none">
              <span className="font-brand text-xl font-black tracking-tight text-foreground sm:text-2xl">Nikkey</span>
              <span className="animate-nikkeybox-pulse font-display text-base font-extrabold tracking-tight text-primary sm:text-lg">Box</span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Abrir menu"
            className="rounded-full p-2.5 text-foreground transition-colors hover:bg-secondary/70"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      <Sidebar open={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </>
  );
};

export default Header;
