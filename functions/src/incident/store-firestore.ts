// Firestore for the incident report. Uses FISHY's own database, like the phone check.
// - incidentLinks/{sha256 of the token}  { checkId, createdAt, handledAt }. No rule lets a client
//   read or write it, and the token itself is never stored.

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { readCheck } from '../call/check-record.ts';
import { firestoreStore, DATABASE_ID } from '../call/store-firestore.ts';
import type { IncidentLink, IncidentStore } from './incident.ts';

const millis = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : typeof value === 'number' && Number.isFinite(value) ? value : null;

export function firestoreIncidents(settings: { companyDomain: string }): IncidentStore {
  const db = getFirestore(DATABASE_ID);
  const calls = firestoreStore(settings);
  const links = db.collection('incidentLinks');

  return {
    async getCheckSummary(checkId) {
      const data = (await db.collection('checks').doc(checkId).get()).data();
      const check = readCheck(data);
      if (!check || !data) return null;
      const flags = (data.summary as { flags?: unknown } | undefined)?.flags;
      return {
        ...check,
        createdAt: millis(data.createdAt),
        flags: Array.isArray(flags) ? flags.filter((flag): flag is string => typeof flag === 'string').slice(0, 20) : [],
      };
    },
    getVerification: (checkId) => calls.getVerification(checkId),
    async getPerson(personId) {
      const person = await calls.getPerson(personId);
      return person ? { name: person.name, role: person.role } : null;
    },
    async saveLink(tokenHash, link) {
      await links.doc(tokenHash).set(link);
    },
    async getLink(tokenHash) {
      const data = (await links.doc(tokenHash).get()).data();
      return data ? ({ checkId: String(data.checkId), createdAt: Number(data.createdAt), handledAt: millis(data.handledAt) } satisfies IncidentLink) : null;
    },
    async markHandled(tokenHash, at) {
      await links.doc(tokenHash).update({ handledAt: at });
    },
  };
}
