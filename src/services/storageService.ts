import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { ensureAdminAuth } from '@/utils/adminAuth';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/webp';
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export const storageService = {
  isDataUrl: (s: string) => typeof s === 'string' && s.startsWith('data:'),
  isStorageUrl: (s: string) => typeof s === 'string' && s.includes('firebasestorage.googleapis.com'),
  isExternalUrl: (s: string) =>
    typeof s === 'string' && s.startsWith('http') && !s.includes('firebasestorage.googleapis.com'),

  /**
   * Faz upload de um data URL para o Firebase Storage.
   * Retorna a URL pública permanente do CDN do Google.
   * slot: 'cover' | 'thumb' | 'gallery_0' | 'gallery_1' | ...
   */
  async uploadImage(productId: string, dataUrl: string, slot: string): Promise<string> {
    if (!storage) throw new Error('Firebase Storage não inicializado');
    await ensureAdminAuth(); // Storage rules exigem auth
    const blob = dataUrlToBlob(dataUrl);
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    // Sufixo de timestamp para invalidar cache do CDN ao atualizar a mesma foto
    const ts = Date.now().toString(36);
    const path = `products/${productId}/${slot}_${ts}.${ext}`;
    const fileRef = ref(storage, path);
    const snapshot = await uploadBytes(fileRef, blob, {
      contentType: blob.type,
      cacheControl: 'public,max-age=31536000,immutable',
    });
    return getDownloadURL(snapshot.ref);
  },

  /** Remove todas as imagens de um produto do Storage (ao deletar produto). */
  async deleteProductFolder(productId: string): Promise<void> {
    if (!storage) return;
    try {
      const folderRef = ref(storage, `products/${productId}`);
      const { items } = await listAll(folderRef);
      await Promise.all(items.map((item) => deleteObject(item)));
    } catch { /* pasta pode não existir ainda */ }
  },
};
