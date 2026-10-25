import { afterEach, describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { defaultProfiles } from "../../domain/config";
import { loadConfig, mergeProfiles, parseConfigDocument, resolveDefaultConfigPath } from "./configLoader";

const tmpFiles: Array<string> = [];

const writeTmpConfig = async (contents: string) => {
  const path = `${Bun.env.TMPDIR ?? "/tmp"}/tsl-config-${crypto.randomUUID()}.yaml`;
  await Bun.write(path, contents);
  tmpFiles.push(path);
  return path;
};

afterEach(async () => {
  for (const path of tmpFiles.splice(0)) {
    if (await Bun.file(path).exists()) {
      await Bun.file(path).delete();
    }
  }
  delete Bun.env.TSL_TEST_KEY;
  delete Bun.env.OPENAI_API_KEY;
  delete Bun.env.XDG_CONFIG_HOME;
});

describe("parseConfigDocument", () => {
  test("accepts a partial document", async () => {
    const document = await Effect.runPromise(
      parseConfigDocument(`
preferredPersona: research
translation:
  target: Japanese
`),
    );

    expect(document.preferredPersona).toBe("research");
    expect(document.translation?.target).toBe("Japanese");
  });

  test("rejects unknown providers", async () => {
    const exit = await Effect.runPromiseExit(
      parseConfigDocument(`
providers:
  - name: anthropic
    apiKey: key
    model: claude
`),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  test("rejects malformed YAML", async () => {
    const exit = await Effect.runPromiseExit(parseConfigDocument("providers: ["));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("loadConfig", () => {
  test("resolves env placeholders and merges profile overrides", async () => {
    Bun.env.TSL_TEST_KEY = "sk-test";
    const path = await writeTmpConfig(`
providers:
  - name: openai
    apiKey: \${ENV:TSL_TEST_KEY}
    model: gpt-4o-mini
profiles:
  programming:
    temperature: 0.1
`);

    const config = await Effect.runPromise(loadConfig(path).pipe(Effect.provide(BunServices.layer)));

    expect(config.providers).toHaveLength(1);
    expect(config.providers[0]?.apiKey).toBe("sk-test");
    expect(config.profiles.programming.temperature).toBe(0.1);
    expect(config.profiles.programming.styleHint).toBe(defaultProfiles.programming.styleHint);
    expect(config.translation.target).toBe("en");
    expect(config.preferredPersona).toBe("programming");
  });

  test("falls back to OPENAI_API_KEY when no config file exists", async () => {
    Bun.env.OPENAI_API_KEY = "sk-env";
    const path = await writeTmpConfig("");
    await Bun.file(path).delete();

    const config = await Effect.runPromise(loadConfig(path).pipe(Effect.provide(BunServices.layer)));

    expect(config.providers[0]?.apiKey).toBe("sk-env");
  });
});

describe("resolveDefaultConfigPath", () => {
  test("honours XDG_CONFIG_HOME", () => {
    Bun.env.XDG_CONFIG_HOME = "/tmp/xdg";
    expect(resolveDefaultConfigPath()).toBe("/tmp/xdg/tsl/config.yaml");
  });
});

describe("mergeProfiles", () => {
  test("keeps defaults for keys without overrides", () => {
    const profiles = mergeProfiles({ review: { temperature: 0.9 } });

    expect(profiles.review.temperature).toBe(0.9);
    expect(profiles.default.temperature).toBe(defaultProfiles.default.temperature);
  });
});
