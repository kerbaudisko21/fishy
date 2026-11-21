import { useEffect, useState } from 'react';

// Entrance motion plays the first time a result is seen, not every time the user comes back to it.
const seen = new Set<string>();

/** True on the first render that shows `key` in this panel session; false on every later mount. */
export function useFirstSeen(key: string) {
  const [first, setFirst] = useState(() => !seen.has(key));
  const [last, setLast] = useState(key);
  if (key !== last) {
    // The key changed while mounted (a new state): it plays if it is new.
    setLast(key);
    setFirst(!seen.has(key));
  }
  useEffect(() => {
    seen.add(key);
  }, [key]);
  return first;
}
