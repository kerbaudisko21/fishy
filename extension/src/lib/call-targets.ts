import type { CallTarget, DirectoryPerson, Supplier } from './types';

const onRecord = (phoneMasked: string | undefined) => !!phoneMasked?.trim();

/**
 * Who FISHY offers to call: the supplier contact (for a supplier's email or invoice), then the
 * approvers in the order they are asked. Only people with a number on record are listed: the
 * server refuses anyone else, and that refusal would come right after "Call … on record".
 */
export function callTargets(people: DirectoryPerson[], supplier?: Supplier): CallTarget[] {
  const list: CallTarget[] = [...people]
    .sort((x, y) => (x.escalationOrder ?? 0) - (y.escalationOrder ?? 0))
    .filter((p) => onRecord(p.phoneMasked))
    .map((p) => ({ id: p.id, name: p.name, role: p.role, phoneMasked: p.phoneMasked }));
  if (supplier && onRecord(supplier.contact.phoneMasked)) {
    list.unshift({ id: supplier.id, name: supplier.contact.name, role: `${supplier.contact.role}, ${supplier.name}`, phoneMasked: supplier.contact.phoneMasked });
  }
  return list;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The person picked first: whoever the request claims to come from, else the first on the list. */
export function defaultTarget(targets: CallTarget[], askedBy: string | undefined): string {
  const asked = askedBy?.trim() ? targets.find((t) => same(t.name, askedBy)) : undefined;
  return asked?.id ?? targets[0]?.id ?? '';
}
