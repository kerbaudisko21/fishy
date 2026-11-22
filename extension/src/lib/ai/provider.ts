import { AgentPlatformBackend, GoogleAIBackend, type Backend } from 'firebase/ai';

/**
 * Which Gemini API Firebase AI Logic sends the cloud call to. Both go through Firebase AI Logic
 * and App Check, and both get redacted text only. They differ in who pays for the call:
 *  - developer       Gemini Developer API. No cost on a project without billing. On a project with
 *                    billing it needs prepaid credit, and free trial credit cannot pay for it.
 *  - agent-platform  Gemini on Agent Platform (formerly Vertex AI), billed on the project's own
 *                    Cloud Billing account.
 * Set with VITE_AI_PROVIDER in extension/.env.local.
 */
export type CloudProvider = 'developer' | 'agent-platform';

export function cloudProvider(setting: string | undefined): CloudProvider {
  const value = (setting ?? '').trim().toLowerCase();
  if (value === '' || value === 'developer') return 'developer';
  if (value === 'agent-platform') return 'agent-platform';
  // A wrong name must not fall back quietly: the default may be the provider that is refused.
  throw new Error(`VITE_AI_PROVIDER must be "developer" or "agent-platform", not "${setting}".`);
}

export function cloudBackend(setting: string | undefined): Backend {
  return cloudProvider(setting) === 'agent-platform' ? new AgentPlatformBackend() : new GoogleAIBackend();
}
