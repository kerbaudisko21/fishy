import { Approval } from './Approval';
import { IncidentPage } from './Incident';

/** Two pages on Firebase Hosting: the web approval (default) and the incident report (/incident?id=…). */
export function App() {
  return location.pathname.startsWith('/incident') ? <IncidentPage /> : <Approval />;
}
