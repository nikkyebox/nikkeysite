import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Eye, LayoutDashboard } from 'lucide-react';
import { useUser } from '@/context/UserContext';

// Barra fixa que aparece quando o admin navega a LOJA (fora do painel),
// deixando claro que ele está em "modo visualização" do site real.
const AdminPreviewBar: React.FC = () => {
  const { isAdminAccount } = useUser();
  const location = useLocation();

  const onAdminPage = location.pathname.startsWith('/admin');

  if (!isAdminAccount || onAdminPage) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-900 text-white shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex items-center gap-1.5 bg-amber-400 text-gray-900 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
            <Eye className="w-3.5 h-3.5" /> Modo Admin
          </span>
          <span className="hidden sm:inline text-gray-300">Você está visualizando o site como cliente.</span>
        </div>
        <Link
          to="/admin"
          className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" /> Painel
        </Link>
      </div>
    </div>
  );
};

export default AdminPreviewBar;
