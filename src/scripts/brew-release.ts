import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const decoder = new TextDecoder();
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const distDir = join(repoRoot, "dist");
const binaryPath = join(distDir, "tsl");
const tarPath = join(distDir, "tsl-macos.tar.gz");

function runCommand(cmd: string[], label: string) {
  console.log(`\n▶ ${label}`);
  const result = Bun.spawnSync({
    cmd,
    cwd: repoRoot,
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${label})`);
  }
  const output = decoder.decode(result.stdout).trim();
  if (output.length > 0) {
    console.log(output);
  }
}

async function ensureExecutable() {
  await chmod(binaryPath, 0o755);
}

async function main() {
  runCommand(["bun", "run", "build:bytecode:macos"], "Build macOS binary");
  await ensureExecutable();
  runCommand([binaryPath, "--help"], "Smoke test tsl --help");
  runCommand(["bun", "run", "distribute:brew"], "Generate tarball + formula");
  runCommand(["tar", "-tzf", tarPath], "Inspect tarball contents");
  runCommand(["bun", "run", "src/scripts/release-guide.ts"], "Follow-up guide");
  console.log("\n🎉 Brew release workflow complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

