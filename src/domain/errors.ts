import * as Schema from "effect/Schema";

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  message: Schema.String,
}) {}

export class ProviderError extends Schema.TaggedError<ProviderError>()("ProviderError", {
  message: Schema.String,
}) {}

export class TranslationError extends Schema.TaggedError<TranslationError>()("TranslationError", {
  message: Schema.String,
}) {}

export class ClipboardError extends Schema.TaggedError<ClipboardError>()("ClipboardError", {
  message: Schema.String,
}) {}
