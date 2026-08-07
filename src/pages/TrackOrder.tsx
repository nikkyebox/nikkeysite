import { safeStorage } from '@/utils/storage';
import React, { useState } from 'react';
import { Search, Package, Truck, CheckCircle, XCircle } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { formatPrice } from '@/utils/currency';

const isDev = import.meta.env.DEV;
const devError = isDev ? console.error.bind(console) : () => {};

type OrderStatusValue = 'pending' | 'processing' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

interface OrderStatus {
  status: OrderStatusValue;
  labelKey: string;
  icon: React.ReactNode;
}

interface TrackedOrderItem {
  productName: string;
  size: string;
  quantity: number;
  price: number;
}

interface TrackedOrder {
  id?: string;
  orderNumber: string;
  date: string;
  status: OrderStatusValue;
  totalAmount: number;
  currency?: string;
  paymentMethod: string;
  items: TrackedOrderItem[];
  shippingAddress: {
    name: string;
    postalCode: string;
    prefecture: string;
    city: string;
    address: string;
    building?: string;
  };
}

const TrackOrder: React.FC = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [searchedOrder, setSearchedOrder] = useState<TrackedOrder | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const statusFlow: OrderStatus[] = [
    { status: 'pending', labelKey: 'trackOrder.status.pending', icon: <Package className="w-6 h-6" /> },
    { status: 'processing', labelKey: 'trackOrder.status.processing', icon: <Package className="w-6 h-6" /> },
    { status: 'confirmed', labelKey: 'trackOrder.status.confirmed', icon: <CheckCircle className="w-6 h-6" /> },
    { status: 'shipped', labelKey: 'trackOrder.status.shipped', icon: <Truck className="w-6 h-6" /> },
    { status: 'delivered', labelKey: 'trackOrder.status.delivered', icon: <CheckCircle className="w-6 h-6" /> },
  ];

  const dateLocale = language === 'pt' ? 'pt-BR' : language === 'ja' ? 'ja-JP' : 'en-US';

  const paymentLabel = (method: string): string => {
    if (method === 'bank') return t('trackOrder.payment.bank');
    if (method === 'paypay') return t('trackOrder.payment.paypay');
    return t('trackOrder.payment.card');
  };

  const handleSearch = async () => {
    if (!orderNumber.trim()) {
      toast({
        title: t('trackOrder.error.title'),
        description: t('trackOrder.error.empty'),
        variant: 'destructive'
      });
      return;
    }

    setIsSearching(true);

    // 1. Buscar no safeStorage (usuários locais)
    const usersData = safeStorage.getItem('japan-express-users');
    let order: TrackedOrder | null = null;

    if (usersData) {
      const users = JSON.parse(usersData);
      for (const email of Object.keys(users)) {
        const userOrders = users[email]?.orders || [];
        const found = userOrders.find((o: TrackedOrder) => o.orderNumber === orderNumber.toUpperCase());
        if (found) {
          order = found;
          break;
        }
      }
    }

    // Also check orders_ prefix keys (legacy format)
    if (!order) {
      const allLocalOrders = Object.keys(safeStorage)
        .filter(key => key.startsWith('orders_'))
        .map(key => safeStorage.getItem(key))
        .filter(Boolean)
        .flatMap(data => JSON.parse(data as string));
      order = allLocalOrders.find((o: TrackedOrder) => o.orderNumber === orderNumber.toUpperCase()) || null;
    }

    // 2. Se não encontrou localmente, busca direta no Firestore pelo ID do pedido
    // (o document ID é o orderNumber — O(1) em vez de ler todos os pedidos)
    if (!order && db) {
      try {
        const snap = await getDoc(doc(db, 'orders', orderNumber.toUpperCase()));
        if (snap.exists()) order = { id: snap.id, ...snap.data() } as TrackedOrder;
      } catch (err) {
        devError('Error searching Firestore:', err);
      }
    }

    setIsSearching(false);

    if (!order) {
      toast({
        title: t('trackOrder.notFound.title'),
        description: t('trackOrder.notFound.desc'),
        variant: 'destructive'
      });
      return;
    }

    setSearchedOrder(order);
  };

  const getStatusIndex = (status: string) => {
    return statusFlow.findIndex(s => s.status === status);
  };

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('trackOrder.title')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('trackOrder.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Search */}
          <div className="bg-card rounded-2xl border border-border p-8 mb-8">
            <div className="flex gap-3">
              <Input
                placeholder={t('trackOrder.placeholder')}
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 text-lg"
              />
              <Button onClick={handleSearch} size="lg" disabled={isSearching}>
                <Search className="w-5 h-5 mr-2" />
                {isSearching ? t('trackOrder.searching') : t('trackOrder.searchBtn')}
              </Button>
            </div>
          </div>

          {/* Order Details */}
          {searchedOrder && (
            <div className="space-y-6">
              {/* Order Info */}
              <div className="bg-card rounded-2xl border border-border p-8">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold mb-2">
                      {t('trackOrder.order')} {searchedOrder.orderNumber}
                    </h2>
                    <p className="text-muted-foreground">
                      {t('trackOrder.placedOn')} {new Date(searchedOrder.date).toLocaleDateString(dateLocale)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">
                      {formatPrice(searchedOrder.totalAmount, searchedOrder.currency || 'BRL')}
                    </p>
                    <p className="text-sm text-muted-foreground">{paymentLabel(searchedOrder.paymentMethod)}</p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="relative">
                  <div className="absolute top-8 left-8 h-full w-0.5 bg-border"></div>

                  {statusFlow.map((step, index) => {
                    const currentIndex = getStatusIndex(searchedOrder.status);
                    const isCompleted = index <= currentIndex;
                    const isCurrent = index === currentIndex;
                    const isCancelled = searchedOrder.status === 'cancelled';

                    return (
                      <div key={step.status} className="relative flex items-start gap-6 pb-8 last:pb-0">
                        <div className={cn(
                          "relative z-10 w-16 h-16 rounded-full flex items-center justify-center border-4 bg-card transition-all",
                          isCompleted && !isCancelled ? 'border-green-500 text-green-500' :
                          isCurrent && !isCancelled ? 'border-blue-500 text-blue-500 animate-pulse' :
                          'border-gray-300 text-gray-300'
                        )}>
                          {step.icon}
                        </div>

                        <div className="flex-1 pt-3">
                          <h3 className={cn(
                            "font-semibold text-lg mb-1",
                            isCompleted && !isCancelled ? 'text-foreground' : 'text-muted-foreground'
                          )}>
                            {t(step.labelKey)}
                          </h3>
                          {isCurrent && (
                            <p className="text-sm text-blue-600 font-medium">{t('trackOrder.status.current')}</p>
                          )}
                          {isCompleted && index < currentIndex && (
                            <p className="text-sm text-green-600">{t('trackOrder.status.completed')}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Cancelled Status */}
                  {searchedOrder.status === 'cancelled' && (
                    <div className="relative flex items-start gap-6">
                      <div className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center border-4 border-red-500 text-red-500 bg-card">
                        <XCircle className="w-6 h-6" />
                      </div>
                      <div className="flex-1 pt-3">
                        <h3 className="font-semibold text-lg mb-1 text-red-600">{t('trackOrder.status.cancelled')}</h3>
                        <p className="text-sm text-muted-foreground">{t('trackOrder.status.cancelledDesc')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Products */}
              <div className="bg-card rounded-2xl border border-border p-8">
                <h3 className="font-semibold text-lg mb-4">{t('trackOrder.products')}</h3>
                <div className="space-y-3">
                  {searchedOrder.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-3 border-b last:border-0">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-sm text-muted-foreground">{item.size} × {item.quantity}</p>
                      </div>
                      <p className="font-semibold">{formatPrice(item.price * item.quantity, searchedOrder.currency || 'BRL')}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-card rounded-2xl border border-border p-8">
                <h3 className="font-semibold text-lg mb-4">{t('trackOrder.shippingAddress')}</h3>
                <p className="text-foreground">
                  {searchedOrder.shippingAddress.name}<br />
                  〒{searchedOrder.shippingAddress.postalCode}<br />
                  {searchedOrder.shippingAddress.prefecture} {searchedOrder.shippingAddress.city}<br />
                  {searchedOrder.shippingAddress.address}
                  {searchedOrder.shippingAddress.building && <><br />{searchedOrder.shippingAddress.building}</>}
                </p>
              </div>
            </div>
          )}

          {!searchedOrder && (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                {t('trackOrder.emptyState')}
              </p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default TrackOrder;
