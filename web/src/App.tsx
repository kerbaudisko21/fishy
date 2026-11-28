import { Approval } from './Approval';
import { IncidentPage } from './Incident';
import { TryPage } from './Try';

/**
 * Three pages on Firebase Hosting: the web approval (default), the incident report (/incident?id=…)
 * and "Try FISHY" (/try), where anyone can run the tactic reader without installing the extension.
 */
export function App() {
  const path = location.pathname;
  if (path.startsWith('/incident')) return <IncidentPage />;
  if (path.startsWith('/try')) return <TryPage />;
  return <Approval />;
}
