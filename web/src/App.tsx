import { Approval } from './Approval';
import { IncidentPage } from './Incident';
import { pageFor } from './route';
import { TryPage } from './Try';

/**
 * Three pages on Firebase Hosting: "Try FISHY" (/try and the bare address), where anyone can run
 * the checks without installing the extension; the web approval (/?t=… from a one-time link, or
 * /?demo); and the incident report (/incident?id=…).
 */
export function App() {
  const page = pageFor(location.pathname, location.search);
  if (page === 'incident') return <IncidentPage />;
  if (page === 'try') return <TryPage />;
  return <Approval />;
}
