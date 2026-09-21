import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadString, getBlob } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const cloudConfigured = Object.values(config).every(Boolean);
const app = cloudConfigured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const storage = app ? getStorage(app) : null;
export type SavedProject = { id: string; name: string; updatedAt?: unknown; layout?: unknown };
export const watchUser = (callback: (user: User | null) => void) => auth ? onAuthStateChanged(auth, callback) : () => {};
export const googleSignIn = () => { if (!auth) throw new Error('Firebase ayarları eksik.'); return signInWithPopup(auth, new GoogleAuthProvider()); };
export const googleSignOut = () => { if (!auth) throw new Error('Firebase ayarları eksik.'); return signOut(auth); };
export async function listProjects(user: User): Promise<SavedProject[]> {
  if (!db) throw new Error('Firebase ayarları eksik.');
  const rows = await getDocs(collection(db, 'users', user.uid, 'projects'));
  return rows.docs.map(row => ({ id: row.id, ...row.data() } as SavedProject));
}
export async function saveProject(user: User, id: string, name: string, dxf: string, layout: unknown): Promise<void> {
  if (!db || !storage) throw new Error('Firebase ayarları eksik.');
  const file = ref(storage, `users/${user.uid}/projects/${id}/source.dxf`);
  await uploadString(file, dxf, 'raw', { contentType: 'application/dxf' });
  await setDoc(doc(db, 'users', user.uid, 'projects', id), { name, layout, updatedAt: serverTimestamp() });
}
export async function openProject(user: User, id: string): Promise<string> {
  if (!storage) throw new Error('Firebase ayarları eksik.');
  const blob = await getBlob(ref(storage, `users/${user.uid}/projects/${id}/source.dxf`));
  return blob.text();
}
