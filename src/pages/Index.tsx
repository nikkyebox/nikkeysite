import React from 'react';
import Layout from '@/components/layout/Layout';
import CategoryQuickNav from '@/components/home/CategoryQuickNav';
import TrustHighlights from '@/components/home/TrustHighlights';
import FeaturedProducts from '@/components/home/FeaturedProducts';
import RecentlyViewed from '@/components/home/RecentlyViewed';
import PersonalShopperBanner from '@/components/home/PersonalShopperBanner';
import HomeVideos from '@/components/home/HomeVideos';
import ShippingBanner from '@/components/home/ShippingBanner';
import NewsletterSection from '@/components/home/NewsletterSection';
import AppDownloadSection from '@/components/AppDownloadSection';
import WelcomeCouponBanner from '@/components/WelcomeCouponBanner';
import Hero from '@/components/home/Hero';
import PromoCarouselSection from '@/components/home/PromoCarouselSection';
import { PWA_INSTALL_ENABLED } from '@/config/featureFlags';

/**
 * Home (marketing route: vitrine). Ordem pensada para compra: hero curto →
 * destaque → categorias → produtos → confiança → serviços → frete → e-mail.
 *
 * Sem fade-on-scroll: seções invisíveis até o IntersectionObserver disparar
 * deixavam a tela em branco em rolagem rápida. O conteúdo aparece pronto.
 */
const Index: React.FC = () => (
  <Layout>
    <Hero />
    <PromoCarouselSection />
    <WelcomeCouponBanner />
    <CategoryQuickNav />
    <FeaturedProducts />
    <RecentlyViewed />
    <TrustHighlights />
    <PersonalShopperBanner />
    <HomeVideos />
    <ShippingBanner />
    <NewsletterSection />
    {/* App Download — desativado (PWA em pausa, ver src/config/featureFlags.ts) */}
    {PWA_INSTALL_ENABLED && <AppDownloadSection />}
  </Layout>
);

export default Index;
