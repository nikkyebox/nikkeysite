import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const emulator = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080');
const separator = emulator.lastIndexOf(':');
const host = emulator.slice(0, separator);
const port = Number(emulator.slice(separator + 1));
const projectId = process.env.GCLOUD_PROJECT || 'nikkey-33f93';
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const environment = await initializeTestEnvironment({
  projectId,
  firestore: { host, port, rules },
});

let checks = 0;
async function succeeds(promise, label) {
  try {
    await assertSucceeds(promise);
    checks += 1;
  } catch (error) {
    throw new Error(`Expected success: ${label}`, { cause: error });
  }
}

async function fails(promise, label) {
  try {
    await assertFails(promise);
    checks += 1;
  } catch (error) {
    throw new Error(`Expected denial: ${label}`, { cause: error });
  }
}

const userDb = environment.authenticatedContext('u1', {
  email: 'u1@example.com',
  email_verified: true,
}).firestore();
const otherDb = environment.authenticatedContext('u2', {
  email: 'u2@example.com',
  email_verified: true,
}).firestore();
const adminDb = environment.authenticatedContext('admin1', {
  email: 'admin@example.com',
  email_verified: true,
  admin: true,
}).firestore();
const anonymousDb = environment.unauthenticatedContext().firestore();

const profile = {
  id: 'u1',
  name: 'Usuário Um',
  email: 'u1@example.com',
  phone: '',
  address: { postalCode: '', prefecture: '', city: '', address: '' },
  createdAt: '2026-08-01T00:00:00.000Z',
  coupons: [],
  points: 0,
  birthdayBonusYear: 0,
  referredTotalBrl: 0,
  referralRewardPaid: false,
};

try {
  await environment.clearFirestore();

  await succeeds(setDoc(doc(userDb, 'users', 'u1'), profile), 'owner creates constrained profile');
  await fails(
    setDoc(doc(otherDb, 'users', 'u2'), { ...profile, id: 'u2', email: 'u2@example.com', points: 1 }),
    'client cannot create initial points',
  );
  await fails(
    setDoc(doc(otherDb, 'users', 'u2'), {
      ...profile,
      id: 'u2',
      email: 'u2@example.com',
      socialFollows: { instagram: true },
    }),
    'client cannot preclaim social follows',
  );
  await succeeds(updateDoc(doc(userDb, 'users', 'u1'), { name: 'Nome Atualizado' }), 'owner edits profile field');
  await fails(updateDoc(doc(userDb, 'users', 'u1'), { points: 999999 }), 'owner cannot edit points');
  await fails(
    updateDoc(doc(userDb, 'users', 'u1'), { coupons: [{ code: 'FORGED', discount: 100 }] }),
    'owner cannot edit coupons',
  );
  await fails(
    updateDoc(doc(userDb, 'users', 'u1'), { socialFollows: { instagram: true } }),
    'owner cannot edit social reward state',
  );

  // MEDIO 4 do AUDITORIA.md: `birthdate` decide um bônus de 1.000 pontos, mas
  // está na lista de campos que o dono edita. Sem congelar, a mesma conta
  // aponta a data para hoje quantas vezes quiser. A regra deixa gravar UMA vez
  // (o cadastro normal continua funcionando) e recusa a troca depois disso.
  await succeeds(
    updateDoc(doc(userDb, 'users', 'u1'), { birthdate: '1990-05-10' }),
    'owner sets birthdate once',
  );
  await fails(
    updateDoc(doc(userDb, 'users', 'u1'), { birthdate: '2026-08-04' }),
    'owner cannot move birthdate to today',
  );
  // A trava não pode pegar quem só edita o resto do cadastro.
  await succeeds(
    updateDoc(doc(userDb, 'users', 'u1'), { phone: '09012345678' }),
    'owner still edits other fields after birthdate is frozen',
  );
  // Correção legítima continua possível pelo admin, que é quem atende o cliente.
  await succeeds(
    updateDoc(doc(adminDb, 'users', 'u1'), { birthdate: '1991-06-11' }),
    'admin fixes a wrong birthdate',
  );
  await fails(getDoc(doc(otherDb, 'users', 'u1')), 'other user cannot read profile');
  await succeeds(getDoc(doc(userDb, 'users', 'u1')), 'owner reads profile');
  await succeeds(
    setDoc(doc(adminDb, 'users', 'imported-user'), { email: 'imported@example.com', points: 500 }),
    'admin creates migrated profile',
  );
  await succeeds(updateDoc(doc(adminDb, 'users', 'u1'), { points: 500 }), 'admin credits points');

  await succeeds(setDoc(doc(adminDb, 'products', 'p1'), { name: 'Produto' }), 'admin writes product');
  await succeeds(getDoc(doc(anonymousDb, 'products', 'p1')), 'public reads product');
  await fails(setDoc(doc(anonymousDb, 'products', 'p2'), { name: 'Ataque' }), 'public cannot write product');

  await succeeds(
    setDoc(doc(adminDb, 'coupons', 'PRIVATE30'), {
      code: 'PRIVATE30',
      targetType: 'specific',
      targetEmails: ['private@example.com'],
    }),
    'admin writes coupon',
  );
  await fails(getDoc(doc(anonymousDb, 'coupons', 'PRIVATE30')), 'anonymous cannot expose coupon targets');
  await fails(getDoc(doc(userDb, 'coupons', 'PRIVATE30')), 'customer cannot expose coupon targets');
  await succeeds(getDoc(doc(adminDb, 'coupons', 'PRIVATE30')), 'admin reads coupon targets');

  await succeeds(setDoc(doc(adminDb, 'raffles', 'active'), { published: true }), 'admin writes raffle');
  await succeeds(getDoc(doc(anonymousDb, 'raffles', 'active')), 'public reads raffle');
  await fails(setDoc(doc(userDb, 'raffles', 'active'), { published: false }), 'customer cannot alter raffle');
  await succeeds(setDoc(doc(adminDb, 'raffle_admin', 'active'), { winners: [] }), 'admin writes private raffle data');
  await succeeds(getDoc(doc(adminDb, 'raffle_admin', 'active')), 'admin reads private raffle data');
  await fails(getDoc(doc(anonymousDb, 'raffle_admin', 'active')), 'public cannot read private raffle data');

  const eventRef = doc(userDb, 'eventos', 'event-1');
  await succeeds(
    setDoc(eventRef, { usuarioId: 'u1', tipo: 'view', criadoEm: '2026-08-01T00:00:00.000Z' }),
    'user creates own event',
  );
  await fails(
    setDoc(doc(userDb, 'eventos', 'event-spoof'), { usuarioId: 'u2', tipo: 'view' }),
    'user cannot spoof event owner',
  );
  await succeeds(getDoc(eventRef), 'user reads own event');
  await fails(getDoc(doc(otherDb, 'eventos', 'event-1')), 'other user cannot read event');
  await fails(updateDoc(eventRef, { tipo: 'changed' }), 'events are immutable');

  const video = {
    id: 'vr-u1-p1',
    userId: 'u1',
    userName: 'Usuário Um',
    userEmail: 'u1@example.com',
    productId: 'p1',
    productName: 'Produto',
    videoUrl: 'https://cdn.example.com/review.mp4',
    status: 'pending',
    submittedAt: '2026-08-01T00:00:00.000Z',
  };
  await succeeds(setDoc(doc(userDb, 'video_reviews', video.id), video), 'user submits constrained video review');
  await fails(
    setDoc(doc(otherDb, 'video_reviews', 'forged'), { ...video, id: 'forged', userId: 'u2', pointsAwarded: 500 }),
    'user cannot self-award video points',
  );
  await fails(updateDoc(doc(userDb, 'video_reviews', video.id), { status: 'approved' }), 'user cannot approve video');
  await succeeds(
    updateDoc(doc(adminDb, 'video_reviews', video.id), { status: 'approved', pointsAwarded: 5 }),
    'admin approves video',
  );

  const negotiation = {
    userId: 'u1',
    userEmail: 'u1@example.com',
    status: 'pending',
    autoApproved: false,
    approvedDiscountYen: null,
    approvedBy: '',
    approvedAt: null,
    resolvedAt: null,
    requestedDiscountYen: 100,
    originalAmountYen: 1000,
    cartItems: [{ productId: 'p1' }],
    clientSeen: false,
  };
  await succeeds(setDoc(doc(userDb, 'negotiations', 'n1'), negotiation), 'user creates constrained negotiation');
  await fails(
    setDoc(doc(otherDb, 'negotiations', 'n-forged'), { ...negotiation, userId: 'u1' }),
    'user cannot create negotiation for another uid',
  );
  await succeeds(updateDoc(doc(userDb, 'negotiations', 'n1'), { clientSeen: true }), 'owner acknowledges negotiation');
  await fails(updateDoc(doc(userDb, 'negotiations', 'n1'), { status: 'approved' }), 'owner cannot approve negotiation');
  await succeeds(updateDoc(doc(adminDb, 'negotiations', 'n1'), { status: 'approved' }), 'admin approves negotiation');

  const cart = {
    items: [{ productId: 'p1', quantity: 1 }],
    totalYen: 1000,
    itemCount: 1,
    abandonedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    reminderSent: false,
    reminderStage: 0,
  };
  await succeeds(setDoc(doc(userDb, 'abandoned_carts', 'u1'), cart), 'owner creates constrained abandoned cart');
  await fails(
    updateDoc(doc(userDb, 'abandoned_carts', 'u1'), { reminderSent: true }),
    'owner cannot mark reminder sent',
  );
  await fails(
    updateDoc(doc(userDb, 'abandoned_carts', 'u1'), { reminderStage: 4 }),
    'owner cannot inject cron stage',
  );
  await succeeds(
    updateDoc(doc(adminDb, 'abandoned_carts', 'u1'), {
      reminderStage: 1,
      reminderSent: true,
      reminderSentAt: 123,
      reminderClaimId: 'cron-claim',
      reminderClaimedAt: 123,
    }),
    'cron controls abandoned cart',
  );
  await succeeds(
    setDoc(doc(userDb, 'abandoned_carts', 'u1'), { ...cart, abandonedAt: '2026-08-02T00:00:00.000Z' }),
    'owner resets sequence after changing cart',
  );
  await fails(getDoc(doc(otherDb, 'abandoned_carts', 'u1')), 'other user cannot read cart snapshot');
  await succeeds(deleteDoc(doc(userDb, 'abandoned_carts', 'u1')), 'owner clears recovered cart');

  const subscription = {
    endpoint: 'https://push.example.com/subscription/u1',
    keys: { p256dh: 'public-key', auth: 'auth-key' },
    customerEmail: 'u1@example.com',
    customerName: 'Usuário Um',
    userAgent: 'Browser',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
  await succeeds(
    setDoc(doc(userDb, 'push_subscriptions', 'sub-u1'), subscription),
    'user writes own push subscription',
  );
  await fails(
    setDoc(doc(otherDb, 'push_subscriptions', 'sub-forged'), { ...subscription, customerEmail: 'u1@example.com' }),
    'user cannot write another email subscription',
  );
  await fails(getDoc(doc(userDb, 'push_subscriptions', 'sub-u1')), 'customer cannot list push endpoints');
  await fails(deleteDoc(doc(otherDb, 'push_subscriptions', 'sub-u1')), 'other user cannot unsubscribe endpoint');
  await succeeds(deleteDoc(doc(userDb, 'push_subscriptions', 'sub-u1')), 'owner unsubscribes endpoint');

  await fails(
    setDoc(doc(userDb, 'affiliate_requests', 'u1@example.com'), { email: 'u1@example.com', status: 'pending' }),
    'client cannot create affiliate request directly',
  );
  await succeeds(
    setDoc(doc(adminDb, 'affiliate_requests', 'u1@example.com'), { email: 'u1@example.com', status: 'pending' }),
    'Admin SDK path creates affiliate request',
  );
  await succeeds(getDoc(doc(userDb, 'affiliate_requests', 'u1@example.com')), 'request owner reads status');
  await fails(getDoc(doc(otherDb, 'affiliate_requests', 'u1@example.com')), 'other user cannot read affiliate request');

  await succeeds(
    setDoc(doc(adminDb, 'affiliate_pending', 'commission-1'), {
      buyerEmail: 'u1@example.com',
      ownerEmail: 'owner@example.com',
      status: 'pending',
    }),
    'server creates pending commission',
  );
  await succeeds(getDoc(doc(userDb, 'affiliate_pending', 'commission-1')), 'buyer reads own pending commission');
  await fails(updateDoc(doc(userDb, 'affiliate_pending', 'commission-1'), { status: 'confirmed' }), 'buyer cannot confirm commission');

  await succeeds(
    setDoc(doc(adminDb, 'orders', 'O1'), { userId: 'u1', customerEmail: 'u1@example.com', status: 'confirmed' }),
    'server creates order',
  );
  await succeeds(getDoc(doc(userDb, 'orders', 'O1')), 'owner reads order');
  await fails(updateDoc(doc(userDb, 'orders', 'O1'), { status: 'delivered' }), 'owner cannot mutate order directly');
  await succeeds(updateDoc(doc(adminDb, 'orders', 'O1'), { customerConfirmed: true }), 'API admin path confirms receipt');

  await fails(setDoc(doc(userDb, 'custom_requests', 'r1'), { userId: 'u1' }), 'custom request requires API');
  await fails(setDoc(doc(userDb, 'b2b_requests', 'b1'), { userId: 'u1' }), 'B2B request requires API');
  await fails(setDoc(doc(userDb, 'newsletter', 'n1'), { email: 'u1@example.com' }), 'newsletter requires API');
  await fails(setDoc(doc(userDb, 'admins', 'u1'), { active: true }), 'user cannot self-promote to admin');
  await fails(setDoc(doc(userDb, 'unknown', 'doc'), { value: true }), 'unknown collection is closed');

  await succeeds(setDoc(doc(adminDb, 'affiliates', 'CODE1'), { active: true }), 'admin writes affiliate code');
  await succeeds(getDoc(doc(anonymousDb, 'affiliates', 'CODE1')), 'public validates one affiliate code');
  await fails(getDocs(collection(anonymousDb, 'affiliates')), 'public cannot list affiliates');


  // promo_state é fechado: holds de pedido não devem vazar para clientes.
  // Admin SDK ignora as regras, então só testamos leitura/escrita de clientes.
  await fails(getDoc(doc(userDb, 'promo_state', 'homePromotion')), 'user cannot read promo_state');
  await fails(setDoc(doc(userDb, 'promo_state', 'homePromotion'), { holds: [] }), 'user cannot write promo_state');
  await fails(getDoc(doc(anonymousDb, 'promo_state', 'homePromotion')), 'anonymous cannot read promo_state');
  await fails(setDoc(doc(anonymousDb, 'promo_state', 'homePromotion'), { holds: [] }), 'anonymous cannot write promo_state');
  console.log(`Firestore rules preflight passed: ${checks} checks`);
} finally {
  await environment.cleanup();
}
