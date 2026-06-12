import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  let errorMessage = 'An unknown error occurred';
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error !== null && typeof error === 'object') {
    try {
      const anyErr = error as any;
      errorMessage = anyErr.message || anyErr.code || 'Object error';
    } catch {
      errorMessage = 'Serialisierungsfehler bei Fehlerobjekt';
    }
  }

  // Erstelle ein flaches Objekt ohne Deep-Referenzen
  const errInfo = {
    error: String(errorMessage).substring(0, 500),
    operationType,
    path,
    timestamp: new Date().toISOString(),
    authUid: auth.currentUser?.uid || null
  };

  try {
    const serialized = JSON.stringify(errInfo);
    console.error('Firestore Error:', serialized);
    throw new Error(serialized);
  } catch (e) {
    console.error('Firestore Error (Raw):', errorMessage);
    throw new Error(errorMessage);
  }
}
