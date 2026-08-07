// Upload de mídia (fotos/vídeos de avaliação) direto para o Firebase Storage.
// Os clientes NÃO têm sessão Firebase Auth (só o admin), então as regras do
// Storage precisam liberar escrita pública nesta pasta — veja storage.rules.
import { storage } from '@/config/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export interface UploadResult {
  url: string;
  path: string;
}

// Faz upload de um arquivo e devolve a URL pública. `onProgress` recebe 0–100.
export function uploadMedia(
  file: File,
  folder: string,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    if (!storage) {
      reject(new Error('Armazenamento indisponível. Tente mais tarde.'));
      return;
    }
    // Nome único: timestamp + nome original limpo.
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-60);
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });

    task.on(
      'state_changed',
      (snap) => {
        if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, path });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}
