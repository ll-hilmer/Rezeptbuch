// Firebase wird nur geladen, wenn Synchronisierung oder Import genutzt werden.
let instance: ReturnType<typeof load> | null = null;

async function load() {
  const [appModule, authModule, firestoreModule, configModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('../../firebase-applet-config.json'),
  ]);
  const config = configModule.default;
  const app = appModule.getApps()[0] || appModule.initializeApp(config);
  const auth = authModule.getAuth(app);
  const firestore = firestoreModule.initializeFirestore(app, { ignoreUndefinedProperties: true }, config.firestoreDatabaseId);
  // Nur für automatisierte Tests gegen den lokalen Firebase-Emulator
  if (import.meta.env.VITE_FIREBASE_EMULATOR) {
    authModule.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    firestoreModule.connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  }
  return { auth, firestore, authModule, firestoreModule };
}

export function getFirebase() {
  if (!instance) {
    instance = load();
    instance.catch(() => { instance = null; });
  }
  return instance;
}

// Liefert den angemeldeten Nutzer (Anmeldung bleibt im Browser gespeichert)
export async function getCurrentUser() {
  const { auth } = await getFirebase();
  await auth.authStateReady();
  return auth.currentUser;
}

export async function signInWithGoogle() {
  const { auth, authModule } = await getFirebase();
  if (auth.currentUser) return auth.currentUser;
  if (import.meta.env.VITE_FIREBASE_EMULATOR) {
    const uid = localStorage.getItem('emulatorUser') || 'test-user';
    const token = JSON.stringify({ sub: uid, email: `${uid}@example.com`, email_verified: true });
    const { user } = await authModule.signInWithCredential(auth, authModule.GoogleAuthProvider.credential(token));
    return user;
  }
  const { user } = await authModule.signInWithPopup(auth, new authModule.GoogleAuthProvider());
  return user;
}

export async function signOutFirebase() {
  const { auth, authModule } = await getFirebase();
  await authModule.signOut(auth);
}
