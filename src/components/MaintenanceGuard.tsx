import React from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '@/context/UserContext';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import MaintenancePage from '@/pages/Maintenance';

interface Props {
  children: React.ReactNode;
}

// Rotas SEMPRE acessíveis, mesmo em manutenção (admin nunca fica trancado fora)
const OPEN_PATHS = ['/admin', '/login', '/firebase-sync', '/sync-data'];

const MaintenanceGuard: React.FC<Props> = ({ children }) => {
  const { isEnabled, loading } = useMaintenanceMode();
  const { isAdmin } = useUser();
  const location = useLocation();

  const isOpenPath = OPEN_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/')
  );

  // Enquanto verifica o estado no Firestore: tela em branco (evita flicker do site)
  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  // Admin e rotas abertas: sempre passam
  if (isAdmin || isOpenPath) {
    return <>{children}</>;
  }

  // Manutenção ativa para o público
  if (isEnabled) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
};

export default MaintenanceGuard;
