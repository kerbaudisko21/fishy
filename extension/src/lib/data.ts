import { collection, doc, getDocs, getFirestore, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { demoData } from '../demo/dataset';
import { DEMO_KNOWN_BAD } from '../demo/fixtures';
import { DATABASE, FIREBASE_READY, IN_EXTENSION, REGION } from './config';
import { ensureSignedIn, firebaseApp } from './firebase';
import { DEFAULT_RULES, mergeRules, type RulesConfig } from './rules/engine';
import type { DirectoryPerson, KnownBadEntry, Supplier } from './types';

/*
 * Everything the panel reads from or writes to Firebase. Without a Firebase config, each
 * function returns the synthetic demo data, so the panel always works.
 */

const db = () => getFirestore(firebaseApp(), DATABASE);
const fn = <I, O>(name: string) => httpsCallable<I, O>(getFunctions(firebaseApp(), REGION), name);

export interface Directory {
  people: DirectoryPerson[];
  suppliers: Supplier[];
}

/** People and suppliers on record, masked (Firestore `directoryPublic`). */
export async function loadDirectory(): Promise<Directory> {
  if (!FIREBASE_READY) {
    const { people, suppliers } = demoData();
    return { people, suppliers };
  }
  await ensureSignedIn();
  const snap = await getDocs(collection(db(), 'directoryPublic'));
  const people: DirectoryPerson[] = [];
  const suppliers: Supplier[] = [];
  snap.forEach((d) => {
    const v = d.data();
    if (v.type === 'supplier') suppliers.push({ id: d.id, ...(v as Omit<Supplier, 'id'>) });
    else people.push({ id: d.id, ...(v as Omit<DirectoryPerson, 'id'>) });
  });
  return { people, suppliers };
}

const KNOWN_KEY = 'knownBad';
const KNOWN_MAX_AGE = 60 * 60 * 1000;

/** Known bad details, cached on the laptop for an hour so matching works offline (R5). */
export async function loadKnownBad(): Promise<{ list: KnownBadEntry[]; updatedAt: number }> {
  if (!FIREBASE_READY) return { list: DEMO_KNOWN_BAD, updatedAt: Date.now() - 2 * 60 * 60 * 1000 };
  if (IN_EXTENSION) {
    const cached = (await chrome.storage.local.get(KNOWN_KEY))[KNOWN_KEY] as { list: KnownBadEntry[]; updatedAt: number } | undefined;
    if (cached && Date.now() - cached.updatedAt < KNOWN_MAX_AGE) return cached;
  }
  await ensureSignedIn();
  const snap = await getDocs(collection(db(), 'knownBad'));
  const value = { list: snap.docs.map((d) => d.data() as KnownBadEntry), updatedAt: Date.now() };
  if (IN_EXTENSION) await chrome.storage.local.set({ [KNOWN_KEY]: value });
  return value;
}

/** Rules engine config from Remote Config `scam_rules`, so new scams are blocked without a release (R2). */
export async function loadRules(): Promise<RulesConfig> {
  if (!FIREBASE_READY) return DEFAULT_RULES;
  try {
    const rc = getRemoteConfig(firebaseApp());
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    await fetchAndActivate(rc);
    const raw = getValue(rc, 'scam_rules').asString();
    return raw ? mergeRules(JSON.parse(raw) as Partial<RulesConfig>) : DEFAULT_RULES;
  } catch (e) {
    console.warn('[FISHY] Remote Config unavailable, using built-in rules', e);
    return DEFAULT_RULES;
  }
}

/** R3 · Domain age in days (RDAP lookup in Cloud Functions; only the domain is sent). */
export async function domainAge(domain: string): Promise<{ days: number; registered: string } | null> {
  if (!FIREBASE_READY) return null;
  try {
    return (await fn<{ domain: string }, { days: number; registered: string }>('domainAge')({ domain })).data;
  } catch (e) {
    console.warn('[FISHY] domain age failed', e);
    return null;
  }
}

/** Web Risk via Cloud Functions: only the links are sent, never the email. */
export async function checkLinks(urls: string[]): Promise<{ unsafe: string[] } | null> {
  if (!FIREBASE_READY || !urls.length) return null;
  try {
    return (await fn<{ urls: string[] }, { unsafe: string[] }>('checkLinks')({ urls })).data;
  } catch (e) {
    console.warn('[FISHY] Web Risk check failed', e);
    return null;
  }
}

/* ---------- Pictures reported as scams: perceptual hashes only ---------- */

export interface ReportedMatch {
  /** How many people reported a picture this close. */
  reports: number;
  /** The closest one's distance, 0–64 bits. */
  distance: number;
}

/**
 * Pictures other FISHY users reported, near this one (perceptual hash within `maxDistance` bits).
 * Looked up by the hash's four 16-bit bands (array-contains-any), then compared exactly here.
 * Only the hash goes out: never the picture.
 */
export async function findReported(hash: string, bands: string[], hammingFn: (a: string, b: string) => number, maxDistance: number): Promise<ReportedMatch | null> {
  if (!FIREBASE_READY) return null;
  try {
    await ensureSignedIn();
    const snap = await getDocs(query(collection(db(), 'reportedFakes'), where('bands', 'array-contains-any', bands), limit(50)));
    let reports = 0;
    let distance = 65;
    for (const d of snap.docs) {
      const other = d.data().hash as string;
      const dist = hammingFn(hash, other);
      if (dist <= maxDistance) {
        reports++;
        distance = Math.min(distance, dist);
      }
    }
    return reports ? { reports, distance } : null;
  } catch (e) {
    console.warn('[FISHY] reported-pictures lookup failed', e);
    return null;
  }
}

/** Reports a picture as a scam, by its hash. One report per person per picture (the rules enforce it). */
export async function reportFake(hash: string, bands: string[], kind: 'picture' | 'document' | 'frame'): Promise<boolean> {
  if (!FIREBASE_READY) return false;
  try {
    const user = await ensureSignedIn();
    await setDoc(doc(db(), 'reportedFakes', `${hash}_${user.uid}`), { hash, bands, kind, uid: user.uid, createdAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.warn('[FISHY] report failed', e);
    return false;
  }
}
