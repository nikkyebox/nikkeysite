import React, { useEffect, useState } from 'react';
import { db } from '@/config/firebase';
import {
  collection, addDoc, deleteDoc, doc, getDocs, query, orderBy,
} from 'firebase/firestore';
import { Trash2, Plus, User, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface Employee {
  id?: string;
  name: string;
  phone: string;
  birthDate: string;
  address: string;
  role: string;
  createdAt?: string;
}

export interface EmployeePayment {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  currency: 'BRL' | 'JPY';
  description?: string;
  createdAt?: string;
}

const COL_EMP = 'employees';
const COL_PAY = 'employee_payments';

export async function getEmployeePayments(): Promise<EmployeePayment[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, COL_PAY), orderBy('date', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeePayment));
  } catch { return []; }
}

const emptyEmp = (): Omit<Employee, 'id' | 'createdAt'> => ({
  name: '', phone: '', birthDate: '', address: '', role: '',
});

const emptyPay = (employees: Employee[]): Omit<EmployeePayment, 'id' | 'createdAt'> => ({
  employeeId: employees[0]?.id || '',
  employeeName: employees[0]?.name || '',
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  currency: 'BRL',
  description: '',
});

const EmployeeManager: React.FC = () => {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'employees' | 'payments'>('employees');
  const [empForm, setEmpForm] = useState(emptyEmp());
  const [payForm, setPayForm] = useState<Omit<EmployeePayment, 'id' | 'createdAt'>>({
    employeeId: '', employeeName: '', date: new Date().toISOString().slice(0, 10),
    amount: 0, currency: 'BRL', description: '',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    if (!db) { setLoading(false); return; }
    try {
      const [empSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, COL_EMP), orderBy('name'))),
        getDocs(query(collection(db, COL_PAY), orderBy('date', 'desc'))),
      ]);
      const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      setEmployees(emps);
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeePayment)));
      if (emps.length > 0) {
        setPayForm(f => ({ ...f, employeeId: emps[0].id!, employeeName: emps[0].name }));
      }
    } catch { /* ignora */ }
    setLoading(false);
  };

  const handleSaveEmployee = async () => {
    if (!empForm.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' }); return;
    }
    if (!db) return;
    setSaving(true);
    try {
      await addDoc(collection(db, COL_EMP), { ...empForm, createdAt: new Date().toISOString() });
      toast({ title: 'Funcionário cadastrado!' });
      setEmpForm(emptyEmp());
      load();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Excluir este funcionário?') || !db) return;
    await deleteDoc(doc(db, COL_EMP, id));
    toast({ title: 'Funcionário removido' });
    load();
  };

  const handleSavePayment = async () => {
    if (!payForm.employeeId || payForm.amount <= 0) {
      toast({ title: 'Selecione funcionário e informe o valor', variant: 'destructive' }); return;
    }
    if (!db) return;
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === payForm.employeeId);
      await addDoc(collection(db, COL_PAY), {
        ...payForm,
        employeeName: emp?.name || payForm.employeeName,
        createdAt: new Date().toISOString(),
      });
      toast({ title: 'Pagamento registrado!' });
      setPayForm(f => ({ ...f, amount: 0, description: '' }));
      load();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Excluir este pagamento?') || !db) return;
    await deleteDoc(doc(db, COL_PAY, id));
    toast({ title: 'Pagamento removido' });
    load();
  };

  const totalBRL = payments.filter(p => p.currency === 'BRL').reduce((s, p) => s + p.amount, 0);
  const totalJPY = payments.filter(p => p.currency === 'JPY').reduce((s, p) => s + p.amount, 0);

  const fmt = (v: number, cur: string) =>
    cur === 'BRL'
      ? `R$${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : `¥${v.toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Funcionários</p>
          <p className="text-2xl font-bold">{employees.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Salários (BRL)</p>
          <p className="text-xl font-bold text-red-500">−R${totalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        {totalJPY > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Salários (JPY)</p>
            <p className="text-xl font-bold text-red-500">−¥{totalJPY.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(['employees', 'payments'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'employees' ? '👤 Funcionários' : '💸 Pagamentos'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : tab === 'employees' ? (
        <div className="space-y-6">
          {/* Formulário novo funcionário */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Funcionário</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Nome *</label>
                <input className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                  value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cargo / Função</label>
                <input className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                  value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} placeholder="Ex: Atendimento" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Telefone</label>
                <input className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                  value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} placeholder="+55 11 99999-9999" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Data de Nascimento</label>
                <input type="date" className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                  value={empForm.birthDate} onChange={e => setEmpForm(f => ({ ...f, birthDate: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Endereço</label>
                <input className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                  value={empForm.address} onChange={e => setEmpForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, cidade..." />
              </div>
            </div>
            <Button onClick={handleSaveEmployee} disabled={saving} className="bg-primary text-white">
              <Plus className="w-4 h-4 mr-1" /> {saving ? 'Salvando...' : 'Cadastrar Funcionário'}
            </Button>
          </div>

          {/* Lista */}
          {employees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum funcionário cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {employees.map(emp => (
                <div key={emp.id} className="bg-card rounded-xl border border-border p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{emp.name}</p>
                      {emp.role && <p className="text-xs text-muted-foreground">{emp.role}</p>}
                      {emp.phone && <p className="text-xs text-muted-foreground">{emp.phone}</p>}
                      {emp.birthDate && <p className="text-xs text-muted-foreground">Nasc: {new Date(emp.birthDate + 'T00:00:00').toLocaleDateString('pt-BR')}</p>}
                      {emp.address && <p className="text-xs text-muted-foreground">{emp.address}</p>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteEmployee(emp.id!)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Formulário novo pagamento */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Registrar Pagamento</h3>
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cadastre um funcionário primeiro.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Funcionário *</label>
                    <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                      value={payForm.employeeId}
                      onChange={e => {
                        const emp = employees.find(em => em.id === e.target.value);
                        setPayForm(f => ({ ...f, employeeId: e.target.value, employeeName: emp?.name || '' }));
                      }}>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Data *</label>
                    <input type="date" className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                      value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Valor *</label>
                    <input type="number" min="0" step="0.01" className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                      value={payForm.amount || ''} onChange={e => setPayForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Moeda</label>
                    <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                      value={payForm.currency} onChange={e => setPayForm(f => ({ ...f, currency: e.target.value as 'BRL' | 'JPY' }))}>
                      <option value="BRL">BRL (Real)</option>
                      <option value="JPY">JPY (Yen)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
                    <input className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                      value={payForm.description || ''} onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Ex: Salário junho, bônus..." />
                  </div>
                </div>
                <Button onClick={handleSavePayment} disabled={saving} className="bg-primary text-white">
                  <Plus className="w-4 h-4 mr-1" /> {saving ? 'Salvando...' : 'Registrar Pagamento'}
                </Button>
              </>
            )}
          </div>

          {/* Lista de pagamentos */}
          {payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum pagamento registrado.</p>
          ) : (
            <div className="space-y-2">
              {payments.map(pay => (
                <div key={pay.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{pay.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(pay.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        {pay.description && ` · ${pay.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-red-500">−{fmt(pay.amount, pay.currency)}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeletePayment(pay.id!)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeManager;
