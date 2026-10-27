import * as Effect from 'effect/Effect';
import { ConfigError } from './errors';

/** Persona identifiers accepted by `--persona` and `preferredPersona`. */
export const PERSONA_KEYS = [
  'default',
  'programming',
  'research',
  'review',
] as const;

export type PersonaKey = (typeof PERSONA_KEYS)[number];

/** A built-in persona: the system directive that shapes a translation. */
export interface PersonaPreset {
  readonly key: PersonaKey;
  readonly title: string;
  readonly system: string;
}

export const PERSONA_PRESETS: Record<PersonaKey, PersonaPreset> = {
  default: {
    key: 'default',
    title: 'General bilingual assistant',
    system:
      'Provide balanced translations and rewrite Korean requirements into concise English instructions.',
  },
  programming: {
    key: 'programming',
    title: 'Strict coding assistant',
    system:
      'Translate with focus on code generation clarity, highlight required tooling and versions, avoid fluff.',
  },
  research: {
    key: 'research',
    title: 'Analytical researcher',
    system:
      'Translate and expand on intent to clarify research goals, cite assumptions, and keep tone formal.',
  },
  review: {
    key: 'review',
    title: 'Peer reviewer',
    system:
      'Translate to English and point out potential gaps or validation steps, keeping feedback actionable.',
  },
};

/** Persona used when neither the CLI nor the config selects one. */
export const FALLBACK_PERSONA_KEY: PersonaKey = 'default';

/** Narrows an arbitrary string to a known persona key. */
export function isPersonaKey(value: string): value is PersonaKey {
  return PERSONA_KEYS.some((key) => key === value);
}

/** Looks up a persona preset, failing with `ConfigError` for unknown keys. */
export function requirePersona(
  key: string,
): Effect.Effect<PersonaPreset, ConfigError> {
  if (!isPersonaKey(key)) {
    return Effect.fail(new ConfigError({ message: `Unknown persona: ${key}` }));
  }
  return Effect.succeed(PERSONA_PRESETS[key]);
}
