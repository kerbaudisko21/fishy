// Firestore as the store.
//
// FISHY keeps everything in its own named database, never in "(default)". It can
// then share a Google Cloud project with another app: its rules and collections
// cannot collide with that app's. The name must match DATABASE in
// extension/src/lib/config.ts and the "database" in firebase.json.
//
// Collections, as firestore.rules and the README describe them:
// - directory/{id}        name, role, phone, pinSalt, pinHash. Only this server code reads it.
// - directoryPublic/{id}  the masked copy the side panel reads. Suppliers are read here
//                         for their domain and the last four digits of their account.
// - checks/{id}           created by the side panel: a summary only. This code writes
//                         its `call` field, which is what the side panel follows.
// - knownBad/{kind:value} confirmed bad accounts, domains and numbers.
//
// Collections only this code uses. No rule lets a client read or write them:
// - checkCalls/{id}       the full record of the phone check for checks/{id}.
// - checkSuspects/{id}    the details of the request a check is about.
// - callCounters/{day}    how many calls were placed that day.
// - personCounters/{person_hour}  how many checks a person got in that hour.
// - pinFailures/{person}  when wrong PINs were entered for that person, over all checks.

import { getFirestore } from 'firebase-admin/firestore';

import { knownBadDoc, knownBadEntry, lastFour } from '../learn/known-bad-doc.ts';
import { readCheck } from './check-record.ts';
import type { Person, Store, Suspects, Verification } from './ports.ts';
import { publicCall } from './public-call.ts';

export const DATABASE_ID = 'fishy';

export function firestoreStore(settings: { companyDomain: string }): Store {
  const db = getFirestore(DATABASE_ID);
  const checks = db.collection('checks');
  const calls = db.collection('checkCalls');

  return {
    async getPerson(personId) {
      const data = (await db.collection('directory').doc(personId).get()).data();
      if (!data) {
        return null;
      }
      const person: Person = {
        id: personId,
        name: String(data.name ?? ''),
        role: String(data.role ?? ''),
        phone: String(data.phone ?? ''),
        pin: { salt: String(data.pinSalt ?? ''), hash: String(data.pinHash ?? '') },
      };
      return person;
    },

    async getCheck(checkId) {
      return readCheck((await checks.doc(checkId).get()).data());
    },

    async createVerification(verification) {
      await db.runTransaction(async (transaction) => {
        const ref = calls.doc(verification.id);
        if ((await transaction.get(ref)).exists) {
          throw new Error('This check already has a phone check.');
        }
        transaction.create(ref, verification);
        transaction.update(checks.doc(verification.id), { call: publicCall(verification) });
      });
    },

    async getVerification(id) {
      const snapshot = await calls.doc(id).get();
      return (snapshot.data() as Verification | undefined) ?? null;
    },

    async updateVerification(id, change) {
      const ref = calls.doc(id);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.data() as Verification | undefined;
        if (!current) {
          return null;
        }
        const next = change(current);
        if (next) {
          // The full record and its public version change together, or not at all.
          transaction.set(ref, next);
          transaction.update(checks.doc(id), { call: publicCall(next) });
        }
        return next ?? current;
      });
    },

    async reserveCall(dayKey, dailyCap) {
      const ref = db.collection('callCounters').doc(dayKey);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const used = Number(snapshot.data()?.count ?? 0);
        if (used >= dailyCap) {
          return false;
        }
        transaction.set(ref, { count: used + 1 });
        return true;
      });
    },

    async reservePersonCheck(personId, hour, limit) {
      const ref = db.collection('personCounters').doc(`${personId}_${hour}`);
      return db.runTransaction(async (transaction) => {
        const used = Number((await transaction.get(ref)).data()?.count ?? 0);
        if (used >= limit) {
          return false;
        }
        transaction.set(ref, { count: used + 1 });
        return true;
      });
    },

    async pinFailuresSince(personId, since) {
      const data = (await db.collection('pinFailures').doc(personId).get()).data();
      const times = Array.isArray(data?.at) ? (data.at as unknown[]).filter((t): t is number => typeof t === 'number') : [];
      return times.filter((t) => t >= since).length;
    },

    async recordPinFailure(personId, at) {
      const ref = db.collection('pinFailures').doc(personId);
      await db.runTransaction(async (transaction) => {
        const data = (await transaction.get(ref)).data();
        const times = Array.isArray(data?.at) ? (data.at as unknown[]).filter((t): t is number => typeof t === 'number') : [];
        // Keep the last 50: enough for any window the lock uses.
        transaction.set(ref, { at: [...times, at].slice(-50) });
      });
    },

    async saveSuspects(verificationId, suspects) {
      await db.collection('checkSuspects').doc(verificationId).set(suspects);
    },

    async getSuspects(verificationId) {
      const snapshot = await db.collection('checkSuspects').doc(verificationId).get();
      return (snapshot.data() as Suspects | undefined) ?? null;
    },

    async raiseKnownBad(entries, now, what) {
      await db.runTransaction(async (transaction) => {
        const refs = entries.map((entry) => db.collection('knownBad').doc(knownBadEntry(entry).id));
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        entries.forEach((entry, index) => {
          const ref = refs[index];
          if (ref) {
            transaction.set(ref, knownBadDoc(snapshots[index]?.data(), entry, now, what));
          }
        });
      });
    },

    async protectedValues() {
      const suppliers = await db.collection('directoryPublic').where('type', '==', 'supplier').get();
      const domains = [settings.companyDomain.trim().toLowerCase()];
      const accounts: string[] = [];
      for (const supplier of suppliers.docs) {
        const data = supplier.data();
        domains.push(String(data.domain ?? '').trim().toLowerCase());
        accounts.push(lastFour(String(data.account?.masked ?? '')));
      }
      return { domains: domains.filter(Boolean), accounts: accounts.filter((account) => account.length === 4) };
    },
  };
}
