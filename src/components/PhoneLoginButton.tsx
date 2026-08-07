import React, { useRef, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone } from 'lucide-react';
import { firebaseSyncService } from '@/services/firebaseSyncService';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

/**
 * Login por telefone (SMS) em 2 passos:
 *  1) usuário digita o número em formato internacional → enviamos o código SMS;
 *  2) usuário digita os 6 dígitos → confirmamos e a sessão é populada.
 * Usa reCAPTCHA invisível (exigido pelo Firebase Phone Auth). No primeiro acesso
 * cria perfil mínimo + cupom BEMVINDO10, igual aos demais logins.
 */
const RECAPTCHA_ID = 'recaptcha-phone-login';

const PhoneLoginButton: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { sendPhoneCode, confirmPhoneCode } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmRef = useRef<ConfirmationResult | null>(null);

  const cleanupVerifier = () => {
    try { verifierRef.current?.clear(); } catch { /* ignora */ }
    verifierRef.current = null;
  };

  const reset = () => {
    cleanupVerifier();
    confirmRef.current = null;
    setStep('phone');
    setCode('');
    setLoading(false);
  };

  const handleSend = async () => {
    const normalized = phone.replace(/[^\d+]/g, '');
    if (!normalized.startsWith('+') || normalized.length < 8) {
      toast({ title: 'Número inválido', description: 'Use o formato internacional, ex.: +5511999998888.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      cleanupVerifier();
      verifierRef.current = firebaseSyncService.createRecaptchaVerifier(RECAPTCHA_ID);
      const result = await sendPhoneCode(normalized, verifierRef.current);
      if (result.success && result.confirmationResult) {
        confirmRef.current = result.confirmationResult;
        setStep('code');
        toast({ title: 'Código enviado!', description: `Enviamos um SMS para ${normalized}.` });
      } else {
        cleanupVerifier();
        toast({ title: 'Erro', description: result.error || 'Não foi possível enviar o SMS.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmRef.current) return;
    if (code.trim().length < 6) {
      toast({ title: 'Código incompleto', description: 'Digite os 6 dígitos do SMS.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await confirmPhoneCode(confirmRef.current, code);
      if (result.success) {
        toast({ title: 'Login realizado!', description: 'Bem-vindo(a)!' });
        setOpen(false);
        reset();
      } else {
        toast({ title: 'Erro', description: result.error || 'Código inválido.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="w-full rounded-xl py-5 font-semibold flex items-center justify-center gap-3 border-2"
      >
        <Phone className="w-5 h-5 shrink-0" />
        Entrar com telefone
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-border p-4">
      {step === 'phone' ? (
        <>
          <Label htmlFor="phone-login" className="flex items-center gap-2">
            <Phone className="w-4 h-4" /> Telefone (com código do país)
          </Label>
          <Input
            id="phone-login"
            type="tel"
            inputMode="tel"
            placeholder="+55 11 99999-8888"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
            disabled={loading}
          />
          <Button type="button" onClick={handleSend} disabled={loading} className="w-full btn-primary rounded-xl py-5 font-semibold">
            {loading ? 'Enviando...' : 'Enviar código SMS'}
          </Button>
        </>
      ) : (
        <>
          <Label htmlFor="phone-code" className="flex items-center gap-2">
            Código recebido por SMS
          </Label>
          <Input
            id="phone-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }}
            disabled={loading}
            className="tracking-[0.4em] text-center text-lg"
          />
          <Button type="button" onClick={handleConfirm} disabled={loading} className="w-full btn-primary rounded-xl py-5 font-semibold">
            {loading ? 'Confirmando...' : 'Confirmar e entrar'}
          </Button>
          <button
            type="button"
            onClick={() => { reset(); }}
            className="text-sm text-primary hover:underline w-full text-center"
            disabled={loading}
          >
            Trocar número / reenviar
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => { setOpen(false); reset(); }}
        className="text-xs text-muted-foreground hover:underline w-full text-center"
      >
        Cancelar
      </button>

      {/* Container do reCAPTCHA invisível exigido pelo Firebase Phone Auth */}
      <div id={RECAPTCHA_ID} />
    </div>
  );
};

export default PhoneLoginButton;
