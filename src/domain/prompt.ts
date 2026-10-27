import { Prompt } from 'effect/ai';
import type { AppConfig, ProfileConfig } from './config';
import type { TranslationRequest } from './translationRequest';

/**
 * Builds the system message: role, the configured formatter (with any
 * hard-coded "English"/"en" swapped for the requested target language),
 * the persona directive and an optional style hint.
 */
export function buildSystemMessage(
  request: TranslationRequest,
  config: AppConfig,
  profile: ProfileConfig,
): string {
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

  return sections.join('\n\n');
}

function buildUserMessage(
  request: TranslationRequest,
  config: AppConfig,
): string {
  const lines = [
    `Source language (${config.translation.source}):`,
    request.sourceText,
    '',
    'Respond with the translated instruction only.',
  ];
  return lines.join('\n');
}

/** Assembles the system + user prompt sent to the language model. */
export function buildTranslationPrompt(
  request: TranslationRequest,
  config: AppConfig,
  profile: ProfileConfig,
) {
  return Prompt.make([
    {
      role: 'system',
      content: buildSystemMessage(request, config, profile),
    },
    {
      role: 'user',
      content: buildUserMessage(request, config),
    },
  ]);
}
