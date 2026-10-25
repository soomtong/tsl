import * as Effect from "effect/Effect";
import { ConfigError } from "./errors";

export const personaKeys = ["default", "programming", "research", "review"] as const;

export type PersonaKey = (typeof personaKeys)[number];

export type PersonaPreset = {
  readonly key: PersonaKey;
  readonly title: string;
  readonly system: string;
};

export const PERSONA_PRESETS: Record<PersonaKey, PersonaPreset> = {
  default: {
    key: "default",
    title: "General bilingual assistant",
    system: "Provide balanced translations and rewrite Korean requirements into concise English instructions.",
  },
  programming: {
    key: "programming",
    title: "Strict coding assistant",
    system: "Translate with focus on code generation clarity, highlight required tooling and versions, avoid fluff.",
  },
  research: {
    key: "research",
    title: "Analytical researcher",
    system: "Translate and expand on intent to clarify research goals, cite assumptions, and keep tone formal.",
  },
  review: {
    key: "review",
    title: "Peer reviewer",
    system: "Translate to English and point out potential gaps or validation steps, keeping feedback actionable.",
  },
};

export const fallbackPersonaKey: PersonaKey = "programming";

export const requirePersona = (key: PersonaKey | string | undefined): Effect.Effect<PersonaPreset, ConfigError> =>
  Effect.gen(function* () {
    const resolved = (typeof key === "string" ? key : fallbackPersonaKey) as PersonaKey;
    const preset = PERSONA_PRESETS[resolved];
    if (!preset) {
      return yield* new ConfigError({ message: `Unknown persona: ${key ?? ""}` });
    }
    return preset;
  });
