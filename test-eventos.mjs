import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
const cfg = { apiKey:"AIzaSyAtURjGGtYG9qFKHgG4AJN4op1-1X7rUWY", authDomain:"nikkeybox.firebaseapp.com", projectId:"nikkeybox", storageBucket:"nikkeybox.firebasestorage.app", messagingSenderId:"597547036364", appId:"1:597547036364:web:fe6c79faa57318ac9b5c69" };
const app=initializeApp(cfg); const db=getFirestore(app); const auth=getAuth(app);
(async()=>{
  const cred = await signInWithEmailAndPassword(auth,'dracko2007@gmail.com','admin123');
  const meuUid = cred.user.uid;
  // 1) Criar evento com MEU uid -> deve PASSAR
  try { await addDoc(collection(db,'eventos'),{ usuarioId: meuUid, tipo:'viu_produto', produtoId:'biore-uv', categoria:'cosmeticos', criadoEm: serverTimestamp() }); console.log('1) Criar com MEU uid: PERMITIDO ✅ (correto)'); }
  catch(e){ console.log('1) Criar com MEU uid: bloqueado ❌', e.code); }
  // 2) Criar evento com uid FALSO (de outra pessoa) -> deve FALHAR
  try { await addDoc(collection(db,'eventos'),{ usuarioId:'uid-de-outra-pessoa-123', tipo:'viu_produto', produtoId:'x', categoria:'doces', criadoEm: serverTimestamp() }); console.log('2) Criar com uid FALSO: PERMITIDO ❌ (FALHA DE SEGURANÇA)'); }
  catch(e){ console.log('2) Criar com uid FALSO: BLOQUEADO ✅ (correto)', e.code); }
  process.exit(0);
})().catch(e=>{console.log('ERRO',e.code||e.message);process.exit(1);});
