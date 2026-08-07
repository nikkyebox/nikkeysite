// Serviço de coleta de eventos de navegação.
// Por enquanto só GRAVA dados (no futuro servirão para recomendações).
// Cada evento vira um documento na coleção "eventos" do Firestore.

import { db, auth } from '@/config/firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

// Os tipos de evento que sabemos registrar (por ora, só "viu um produto").
// Usar um type assim evita erros de digitação tipo 'viu_produot'.
export type TipoEvento = 'viu_produto';

// O formato de um documento na coleção "eventos".
// criadoEm é FieldValue na hora de gravar (serverTimestamp) e Timestamp na leitura.
export interface Evento {
  usuarioId: string;
  tipo: TipoEvento;
  produtoId: string;
  categoria: string;
  criadoEm: Timestamp | FieldValue;
}

/**
 * Registra um evento de navegação do usuário logado.
 *
 * @param tipo      o que aconteceu (ex: 'viu_produto')
 * @param produtoId qual produto (ex: 'biore-uv')
 * @param categoria categoria do produto (ex: 'cosmeticos')
 *
 * O usuarioId é pego sozinho do usuário logado (auth.currentUser.uid).
 * Se NÃO houver usuário logado, a função simplesmente não grava nada
 * e não dá erro.
 */
export async function registrarEvento(
  tipo: TipoEvento,
  produtoId: string,
  categoria: string
): Promise<void> {
  // 1) Sem Firebase pronto ou sem ninguém logado → sai sem fazer nada.
  if (!db || !auth?.currentUser) return;

  // 2) Pega o identificador único do usuário direto do Firebase Auth.
  const usuarioId = auth.currentUser.uid;

  // 3) Monta o documento já tipado (o TypeScript confere os campos).
  const evento: Evento = {
    usuarioId,
    tipo,
    produtoId,
    categoria,
    criadoEm: serverTimestamp(),
  };

  // 4) Grava na coleção "eventos". Se falhar, só avisa no console —
  //    nunca quebra a navegação do usuário.
  try {
    await addDoc(collection(db, 'eventos'), evento);
  } catch (erro) {
    devWarn('Não foi possível registrar o evento:', erro);
  }
}
