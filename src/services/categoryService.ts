// Categorias de produto — padrão (fixas) + personalizadas (Firestore).
// O admin pode adicionar novas categorias que ficam salvas para uso futuro.
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface ProductCategory {
  id: string;
  label: string;
  icon: string;
}

// Categorias padrão — sempre presentes
export const DEFAULT_CATEGORIES: ProductCategory[] = [
  { id: 'cosmeticos', label: 'Cosméticos', icon: '🧴' },
  { id: 'doces', label: 'Doces & Chás', icon: '🍵' },
  { id: 'acessorios', label: 'Acessórios', icon: '🎮' },
  { id: 'papelaria', label: 'Papelaria', icon: '✏️' },
  { id: 'eletronicos', label: 'Eletrônicos', icon: '📱' },
  { id: 'masculino', label: 'Masculino', icon: '👔' },
  { id: 'vestuario', label: 'Vestuário', icon: '👕' },
  { id: 'higiene', label: 'Higiene & Saúde', icon: '🧼' },
  { id: 'pet', label: 'Pet', icon: '🐕' },
];

const SETTINGS_DOC = 'product_categories';

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const categoryService = {
  /** Lista padrão + personalizadas (sem duplicar ids). */
  async getAll(): Promise<ProductCategory[]> {
    if (!db) return DEFAULT_CATEGORIES;
    try {
      const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC));
      const custom: ProductCategory[] = snap.exists() ? (snap.data().list || []) : [];
      const map = new Map<string, ProductCategory>();
      // Custom primeiro; padrão sobrescreve (emoji/label das padrão sempre prevalecem)
      for (const c of custom) if (c?.id) map.set(c.id, c);
      for (const c of DEFAULT_CATEGORIES) map.set(c.id, c);
      return Array.from(map.values());
    } catch {
      return DEFAULT_CATEGORIES;
    }
  },

  /** Adiciona uma categoria personalizada. Retorna a categoria criada. */
  async add(label: string, icon = '🏷️'): Promise<ProductCategory | null> {
    if (!db || !label.trim()) return null;
    const id = slugify(label);
    if (!id) return null;
    const newCat: ProductCategory = { id, label: label.trim(), icon: icon || '🏷️' };
    try {
      const ref = doc(db, 'settings', SETTINGS_DOC);
      const snap = await getDoc(ref);
      const custom: ProductCategory[] = snap.exists() ? (snap.data().list || []) : [];
      // Não duplica padrão nem existente
      if (DEFAULT_CATEGORIES.some(c => c.id === id) || custom.some(c => c.id === id)) {
        return newCat; // já existe — só retorna
      }
      const updated = [...custom, newCat];
      await setDoc(ref, { list: updated }, { merge: true });
      return newCat;
    } catch {
      return null;
    }
  },

  /** Edita label/emoji de uma categoria personalizada (mantém o mesmo id). */
  async update(id: string, label: string, icon: string): Promise<boolean> {
    if (!db || !label.trim()) return false;
    if (DEFAULT_CATEGORIES.some(c => c.id === id)) return false; // padrão não edita
    try {
      const ref = doc(db, 'settings', SETTINGS_DOC);
      const snap = await getDoc(ref);
      const custom: ProductCategory[] = snap.exists() ? (snap.data().list || []) : [];
      const updated = custom.map(c =>
        c.id === id ? { ...c, label: label.trim(), icon: icon.trim() || c.icon } : c
      );
      await setDoc(ref, { list: updated }, { merge: true });
      return true;
    } catch {
      return false;
    }
  },

  /** Remove uma categoria personalizada (não remove as padrão). */
  async remove(id: string): Promise<boolean> {
    if (!db || DEFAULT_CATEGORIES.some(c => c.id === id)) return false;
    try {
      const ref = doc(db, 'settings', SETTINGS_DOC);
      const snap = await getDoc(ref);
      const custom: ProductCategory[] = snap.exists() ? (snap.data().list || []) : [];
      await setDoc(ref, { list: custom.filter(c => c.id !== id) }, { merge: true });
      return true;
    } catch {
      return false;
    }
  },

  /** true se a categoria é padrão (não pode editar/deletar). */
  isDefault(id: string): boolean {
    return DEFAULT_CATEGORIES.some(c => c.id === id);
  },
};
