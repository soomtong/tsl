import type { AppConfig, ProfileConfig } from "../domain/config";
import type { PersonaPreset } from "../domain/persona";

export const logPersonaAndTarget = (persona: PersonaPreset, targetLanguage: string) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target] ${targetLanguage}`);
};

export const logTranslationOutputs = (outputs: ReadonlyArray<string>) => {
  outputs.forEach((text, index) => {
    const label = outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
    console.log(`📝 ${label}`);
    console.log(text);
    console.log("");
  });
};

export const logClipboardStatus = (copied: boolean, autoCopyEnabled: boolean) => {
  if (copied) {
    console.log("✅ Copied translation to clipboard");
  } else if (!autoCopyEnabled) {
    console.log("ℹ️ Auto-copy disabled in config");
  }
};

export const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`🌡️[temperature] ${profile.temperature}`);
  console.log(`📏 [maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`🎨 [styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `⚙️[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("🪄 [formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};
