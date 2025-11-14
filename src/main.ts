import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { program } from "./cli-program";

BunRuntime.runMain(program.pipe(Effect.provide(BunContext.layer)));
