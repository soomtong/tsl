import * as Effect from "effect/Effect";

export type PersonaKey = "default" | "programming" | "research" | "review";

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

export const personaKeys: ReadonlyArray<PersonaKey> = Object.keys(PERSONA_PRESETS) as ReadonlyArray<PersonaKey>;

export const requirePersona = (key: PersonaKey | string | undefined) =>
  Effect.try({
    try: (): PersonaPreset => {
      const resolved = (typeof key === "string" ? key : "default") as PersonaKey;
      const preset = PERSONA_PRESETS[resolved];
      if (!preset) {
        throw new Error(`Unknown persona: ${key ?? ""}`);
      }
      return preset;
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const fallbackPersonaKey: PersonaKey = "programming";

