import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '@/context/UserContext';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

/**
 * Protege rotas que só o administrador pode acessar (painel e páginas de debug).
 * Usuários não-admin são redirecionados para a home.
 */
const RequireAdmin: React.FC<Props> = ({ children }) => {
  const { isAdmin, isAuthenticated } = useUser();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="font-display text-lg font-bold mb-2">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Esta área é exclusiva para administradores.
          </p>
          <a href="/" className="inline-block px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
            Voltar ao início
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAdmin;
