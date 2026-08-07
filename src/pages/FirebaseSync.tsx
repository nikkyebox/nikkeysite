import { safeStorage } from '@/utils/storage';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { db as firebaseDb, auth as firebaseAuth } from '@/config/firebase';
import { firebaseSyncService } from '@/services/firebaseSyncService';
import { collection, getDocs } from 'firebase/firestore';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export default function FirebaseSync() {
  const [logs, setLogs] = useState<Array<{ time: string; message: string; color: string }>>([]);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [db, setDb] = useState<any>(null);
  const [auth, setAuth] = useState<any>(null);

  useEffect(() => {
    initializeFirebase();
  }, []);

  const initializeFirebase = async () => {
    try {
      if (!firebaseDb || !firebaseAuth) {
        throw new Error('Firebase not initialized');
      }
      setAuth(firebaseAuth);
      setDb(firebaseDb);

      addLog('✅ Firebase inicializado com sucesso', '#22c55e');
      setTimeout(() => testConnection(firebaseDb), 500);
    } catch (error: any) {
      addLog('❌ Erro ao inicializar Firebase: ' + error.message, '#ef4444');
    }
  };

  const addLog = (message: string, color: string = '#22c55e') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { time, message, color }]);
  };

  const showStatus = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setStatus({ message, type });
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs limpos');
  };

  const testConnection = async (dbInstance?: any) => {
    const database = dbInstance || db;
    if (!database) {
      addLog('❌ Firebase não inicializado', '#ef4444');
      return;
    }

    try {
      addLog('🔍 Testando conexão com Firebase...', '#3b82f6');
      showStatus('🔄 Testando conexão...', 'info');

      const testCollection = collection(database, 'test');
      addLog('✅ Firestore conectado!', '#22c55e');
      addLog('✅ Authentication conectado!', '#22c55e');

      const usersData = safeStorage.getItem('japan-express-users');
      if (usersData) {
        const users = JSON.parse(usersData);
        const userCount = Object.keys(users).length;
        addLog(`📊 Encontrados ${userCount} usuários no safeStorage`, '#06b6d4');
      } else {
        addLog('⚠️ Nenhum dado no safeStorage', '#f59e0b');
      }

      showStatus('✅ Conexão com Firebase OK! Pronto para migrar dados.', 'success');
      addLog('✅ Teste completo!', '#22c55e');
    } catch (error: any) {
      addLog('❌ Erro: ' + error.message, '#ef4444');
      showStatus('❌ Erro na conexão: ' + error.message, 'error');
    }
  };

  const migrateData = async () => {
    if (!db) {
      addLog('Firebase não inicializado', '#ef4444');
      return;
    }

    try {
      addLog('Iniciando migração de dados...', '#3b82f6');
      showStatus('Migrando dados...', 'info');
      const result = await firebaseSyncService.migrateLocalStorageToFirestore();
      if (!result.success) throw result.error;

      const migratedUsers = 'migrated' in result ? Number(result.migrated || 0) : 0;
      const migratedOrders = 'orders' in result ? Number(result.orders || 0) : 0;
      addLog(
        `Migração completa: ${migratedUsers} usuários, ${migratedOrders} pedidos`,
        '#22c55e',
      );
      showStatus(
        `${migratedUsers} usuários e ${migratedOrders} pedidos migrados para a nuvem.`,
        'success',
      );
    } catch (error: any) {
      addLog('Erro na migração: ' + error.message, '#ef4444');
      showStatus('Erro na migração: ' + error.message, 'error');
      devError(error);
    }
  };

  const debugLocalStorage = () => {
    addLog('🔍 Debugando safeStorage...', '#3b82f6');
    
    const usersData = safeStorage.getItem('japan-express-users');
    addLog(`📦 japan-express-users existe? ${!!usersData}`, '#06b6d4');
    
    if (usersData) {
      const users = JSON.parse(usersData);
      const userCount = Object.keys(users).length;
      addLog(`👥 Total de usuários: ${userCount}`, '#22c55e');
      
      Object.entries(users).forEach(([email, userData]: [string, any]) => {
        addLog(`  - Email: ${email}`, '#06b6d4');
        addLog(`    Nome: ${userData.name || 'N/A'}`, '#06b6d4');
        addLog(`    ID: ${userData.id || 'N/A'}`, '#06b6d4');
        addLog(`    Pedidos: ${userData.orders?.length || 0}`, '#22c55e');
        
        if (userData.orders && userData.orders.length > 0) {
          userData.orders.forEach((order: any, idx: number) => {
            addLog(`      └─ Pedido ${idx + 1}: ${order.orderNumber || 'N/A'}`, '#f59e0b');
          });
        }
      });
      
      showStatus(`✅ ${userCount} usuários no safeStorage`, 'success');
    } else {
      addLog('❌ safeStorage vazio!', '#ef4444');
      showStatus('❌ Nenhum dado no safeStorage', 'error');
    }
  };

  const viewFirestoreData = async () => {
    if (!db) {
      addLog('❌ Firebase não inicializado', '#ef4444');
      return;
    }

    try {
      addLog('👀 Buscando dados do Firestore...', '#3b82f6');
      showStatus('🔄 Carregando dados...', 'info');

      const usersSnapshot = await getDocs(collection(db, 'users'));
      addLog(`📊 Usuários na nuvem: ${usersSnapshot.size}`, '#06b6d4');
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        addLog(`  - ${data.email || data.name || doc.id}`, '#22c55e');
      });

      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      addLog(`📦 Pedidos na nuvem: ${ordersSnapshot.size}`, '#06b6d4');
      ordersSnapshot.forEach(doc => {
        const data = doc.data();
        addLog(`  - ${doc.id}: ${data.customerEmail || 'N/A'} - ${data.status || 'pending'}`, '#22c55e');
      });

      showStatus(`✅ ${usersSnapshot.size} usuários e ${ordersSnapshot.size} pedidos na nuvem!`, 'success');
    } catch (error: any) {
      addLog('❌ Erro: ' + error.message, '#ef4444');
      showStatus('❌ Erro ao buscar dados: ' + error.message, 'error');
    }
  };

  const getStatusClass = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800 border-green-300';
      case 'error': return 'bg-red-100 text-red-800 border-red-300';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-purple-900 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">🔥 Firebase Sync</h1>
        <p className="text-gray-600 mb-8">Teste e migre seus dados para a nuvem</p>

        {status && (
          <div className={`p-4 rounded-xl border-2 mb-6 ${getStatusClass(status.type)}`}>
            {status.message}
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-6">
          <Button onClick={() => testConnection()} variant="default">
            🔌 Testar Conexão
          </Button>
          <Button onClick={debugLocalStorage} variant="default">
            🔍 Debug safeStorage
          </Button>
          <Button onClick={migrateData} variant="default">
            🔄 Migrar Dados
          </Button>
          <Button onClick={viewFirestoreData} variant="default">
            👀 Ver Dados na Nuvem
          </Button>
          <Button onClick={clearLogs} variant="outline">
            🗑️ Limpar Logs
          </Button>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 max-h-96 overflow-y-auto font-mono text-sm">
          {logs.map((log, index) => (
            <div key={index} className="py-1 border-b border-gray-800" style={{ color: log.color }}>
              [{log.time}] {log.message}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-gray-500">Aguardando operações...</div>
          )}
        </div>

        <a href="/" className="inline-block mt-6 text-purple-600 font-semibold hover:underline">
          ← Voltar ao Site
        </a>
      </div>
    </div>
  );
}
