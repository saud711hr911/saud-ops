import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { DocumentReference, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const firebaseAdminApp = getApps()[0] ?? initializeApp();

export const adminAuth = getAuth(firebaseAdminApp);
export const adminDb = getFirestore(firebaseAdminApp);
export const adminBucket = getStorage(firebaseAdminApp).bucket(process.env.STORAGE_BUCKET || "saud-ops-masar.firebasestorage.app");

export type StoredRecord = { id: number };

export function newNumericId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export function nowIso() {
  return new Date().toISOString();
}

export async function listRecords<T extends StoredRecord>(collectionName: string): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map((document) => document.data() as T);
}

export async function getRecord<T extends StoredRecord>(collectionName: string, id: number): Promise<T | null> {
  const snapshot = await adminDb.collection(collectionName).doc(String(id)).get();
  return snapshot.exists ? snapshot.data() as T : null;
}

export async function createRecord<T extends StoredRecord>(collectionName: string, values: Omit<T, "id"> & { id?: number }): Promise<T> {
  const id = values.id ?? newNumericId();
  const record = { ...values, id } as T;
  await adminDb.collection(collectionName).doc(String(id)).set(record);
  return record;
}

export async function setRecord<T extends StoredRecord>(collectionName: string, record: T) {
  await adminDb.collection(collectionName).doc(String(record.id)).set(record);
}

export async function updateRecord(collectionName: string, id: number, values: Record<string, unknown>) {
  const cleanValues = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  await adminDb.collection(collectionName).doc(String(id)).update(cleanValues);
}

export async function deleteRecord(collectionName: string, id: number) {
  await adminDb.collection(collectionName).doc(String(id)).delete();
}

export async function deleteReferences(references: DocumentReference[]) {
  for (let index = 0; index < references.length; index += 450) {
    const batch = adminDb.batch();
    references.slice(index, index + 450).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}

export function recordReference(collectionName: string, id: number) {
  return adminDb.collection(collectionName).doc(String(id));
}
