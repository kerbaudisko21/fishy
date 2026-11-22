import { AgentPlatformBackend, GoogleAIBackend } from 'firebase/ai';
import { describe, expect, it } from 'vitest';
import { cloudBackend, cloudProvider } from './provider';

describe('cloudProvider', () => {
  it('is the Gemini Developer API when nothing is set', () => {
    expect(cloudProvider(undefined)).toBe('developer');
    expect(cloudProvider('')).toBe('developer');
    expect(cloudProvider('developer')).toBe('developer');
  });

  it('is Agent Platform when the build asks for it', () => {
    expect(cloudProvider('agent-platform')).toBe('agent-platform');
  });

  it('ignores case and stray spaces', () => {
    expect(cloudProvider('  Agent-Platform ')).toBe('agent-platform');
    expect(cloudProvider('DEVELOPER')).toBe('developer');
  });

  it('refuses a name it does not know instead of quietly using the default', () => {
    expect(() => cloudProvider('vertex')).toThrow(/VITE_AI_PROVIDER.*"developer".*"agent-platform".*"vertex"/);
  });
});

describe('cloudBackend', () => {
  it('gives Firebase AI Logic the backend that matches', () => {
    expect(cloudBackend(undefined)).toBeInstanceOf(GoogleAIBackend);
    expect(cloudBackend('developer')).toBeInstanceOf(GoogleAIBackend);
    expect(cloudBackend('agent-platform')).toBeInstanceOf(AgentPlatformBackend);
  });

  it('sends Agent Platform calls to the global location', () => {
    expect((cloudBackend('agent-platform') as AgentPlatformBackend).location).toBe('global');
  });
});
