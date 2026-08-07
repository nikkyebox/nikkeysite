import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
const cfg = { apiKey:"PENDING_NIKKEY33F93_API_KEY", authDomain:"nikkey-33f93.firebaseapp.com", projectId:"nikkey-33f93", storageBucket:"nikkey-33f93.firebasestorage.app", messagingSenderId:"PENDING_NIKKEY33F93_MSG_SENDER_ID", appId:"PENDING_NIKKEY33F93_APP_ID" };
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
