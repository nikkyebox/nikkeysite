import React, { useState } from 'react';
import { Package, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { emailServiceSimple } from '@/services/emailServiceSimple';
import { useToast } from '@/hooks/use-toast';



interface TrackingModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (trackingNumber: string, carrier: string) => void | Promise<void>;
}

const TrackingModal: React.FC<TrackingModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [selectedCarrier, setSelectedCarrier] = useState(order?.shipping?.carrier || '');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();


  const handleSubmit = async () => {
    const normalizedTrackingNumber = trackingNumber.trim();
    if (!normalizedTrackingNumber) {
      toast({
        title: 'Erro',
        description: 'Digite o número de rastreamento',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const carrier = selectedCarrier || order.shipping?.carrier || '';
      // Persiste o rastreio antes do e-mail; o template do servidor lê o pedido
      // atualizado e nunca aceita HTML ou destinatário fornecido pelo navegador.
      await onSuccess(normalizedTrackingNumber, carrier);
      const emailSent = await emailServiceSimple.sendTrackingNotification({
        orderNumber: order.orderNumber,
      });
      toast(emailSent
        ? {
            title: 'E-mail enviado!',
            description: `Notificação de envio enviada para ${order.shippingAddress?.name || order.customerName || 'cliente'}`,
          }
        : {
            title: 'Pedido atualizado',
            description: 'O rastreio foi salvo, mas o e-mail não pôde ser enviado.',
            variant: 'destructive',
          });
      onClose();
    } catch {
      toast({
        title: 'Erro ao marcar o envio',
        description: 'O rastreio não foi salvo. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Marcar como Enviado
          </DialogTitle>
          <DialogDescription>
            Pedido #{order?.orderNumber} - {order?.shippingAddress?.name || order?.customerName || 'N/A'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="tracking">Número de Rastreamento *</Label>
            <Input
              id="tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
              placeholder="Ex: JP123456789BR"
              className="mt-2"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              Digite o código de rastreamento da transportadora
            </p>
          </div>

          <div>
            <Label htmlFor="carrier">Transportadora *</Label>
            <select
              id="carrier"
              value={selectedCarrier}
              onChange={(e) => setSelectedCarrier(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Selecione a transportadora</option>
              <option value="Correios">Correios (Brasil) 🇧🇷</option>
              <option value="Yamato">Yamato Transport (クロネコヤマト)</option>
              <option value="Sagawa">Sagawa Express (佐川急便)</option>
              <option value="Japan Post">Japan Post (日本郵便)</option>
              <option value="Fukutsu">Fukutsu Express (福山通運)</option>
            </select>
            {order?.shipping?.carrier && (
              <p className="text-xs text-muted-foreground mt-1">
                Transportadora do pedido: {order.shipping.carrier}
              </p>
            )}
          </div>

          <div className="bg-secondary/30 rounded-lg p-4 text-sm space-y-2">
            <p><strong>O que acontecerá:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Status do pedido será atualizado para "Enviado"</li>
              <li>Cliente receberá email com o número de rastreamento</li>
              <li>Email incluirá resumo completo do pedido</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSending || !trackingNumber.trim() || !selectedCarrier}
            className="gap-2"
          >
            {isSending ? (
              <>Enviando...</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Confirmar Envio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TrackingModal;
