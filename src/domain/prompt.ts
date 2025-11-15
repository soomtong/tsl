import { Prompt } from "@effect/ai";
import type { AppConfig, ProfileConfig } from "./config";
import type { TranslationRequest } from "./translationRequest";

export const buildSystemMessage = (request: TranslationRequest, config: AppConfig, profile: ProfileConfig) => {
  // Replace any hardcoded language references in formatter with the actual target language
  const formatterWithLanguage = config.translation.formatter
    .replace(/\bEnglish\b/gi, request.targetLanguage)
    .replace(/\ben\b/gi, request.targetLanguage);

  const sections = [
    `You are a bilingual assistant that translates ${config.translation.source.toUpperCase()} engineering requirements into concise ${request.targetLanguage.toUpperCase()} instructions.`,
    formatterWithLanguage,
    `Persona directive: ${request.persona.system}`,
  ];

  if (profile.styleHint) {
    sections.push(`Style hint: ${profile.styleHint}`);
  }

  return sections.join("\n\n");
};

const buildUserMessage = (request: TranslationRequest, config: AppConfig) => {
  const lines = [
    `Source language (${config.translation.source}):`,
    request.sourceText,
    "",
    "Respond with the translated instruction only.",
  ];
  return lines.join("\n");
};

export const buildTranslationPrompt = (request: TranslationRequest, config: AppConfig, profile: ProfileConfig) =>
  Prompt.make([
    {
      role: "system",
      content: buildSystemMessage(request, config, profile),
    },
    {
      role: "user",
      content: buildUserMessage(request, config),
    },
  ]);
