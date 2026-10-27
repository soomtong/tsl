const decoder = new TextDecoder();
const scriptDir = import.meta.dir;
const repoRoot = `${scriptDir}/../..`;
const distDir = `${repoRoot}/dist`;
const binaryPath = `${distDir}/tsl`;
const tarPath = `${distDir}/tsl-macos.tar.gz`;

function runCommand(cmd: string[], label: string) {
  console.log(`\n▶ ${label}`);
  const result = Bun.spawnSync({
    cmd,
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${label})`);
  }
  const output = decoder.decode(result.stdout).trim();
  if (output.length > 0) {
    console.log(output);
  }
}

async function main() {
  runCommand(['bun', 'run', 'build:bytecode:macos'], 'Build macOS binary');
  runCommand(['chmod', '755', binaryPath], 'Ensure executable permissions');
  runCommand([binaryPath, '--help'], 'Smoke test tsl --help');
  runCommand(['bun', 'run', 'distribute:brew'], 'Generate tarball + formula');
  runCommand(['tar', '-tzf', tarPath], 'Inspect tarball contents');
  runCommand(['bun', 'run', 'src/scripts/release-guide.ts'], 'Follow-up guide');
  console.log('\n🎉 Brew release workflow complete.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
