import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { AlertCircle, CreditCard, Loader2 } from 'lucide-react';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface StripeCardFormProps {
  clientSecret: string;
  onSuccess: () => void;
}

const CheckoutForm: React.FC<Pick<StripeCardFormProps, 'onSuccess'>> = ({ onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (result.error) {
      setError(result.error.message || 'Não foi possível processar o pagamento.');
      setSubmitting(false);
      return;
    }
    if (result.paymentIntent && ['succeeded', 'processing'].includes(result.paymentIntent.status)) {
      onSuccess();
      return;
    }
    setError('Pagamento não confirmado. Tente novamente.');
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <PaymentElement />
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" disabled={!stripe || submitting} className="btn-primary w-full gap-2 rounded-xl py-4 text-base font-bold">
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
        {submitting ? 'Processando...' : 'Pagar com Cartão'}
      </Button>
    </form>
  );
};

const StripeCardForm: React.FC<StripeCardFormProps> = ({ clientSecret, onSuccess }) => {
  if (!stripePromise) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">Pagamento com cartão ainda não configurado.</div>;
  }
  if (!clientSecret) {
    return <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparando pagamento seguro...</div>;
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm onSuccess={onSuccess} />
    </Elements>
  );
};

export default StripeCardForm;
