const decoder = new TextDecoder();
const scriptDir = import.meta.dir;
const repoRoot = `${scriptDir}/../..`;
const distDir = `${repoRoot}/dist`;
const binaryPath = `${distDir}/tsl`;
const tarName = 'tsl-macos.tar.gz';
const tarPath = `${distDir}/${tarName}`;
const formulaDir = `${distDir}/homebrew`;
const formulaPath = `${formulaDir}/tsl.rb`;

const sanitizedEnv = { ...Bun.env };
delete sanitizedEnv.OPENAI_API_KEY;

function runCommand(cmd: string[], description: string) {
  const result = Bun.spawnSync({
    cmd,
    cwd: repoRoot,
    env: sanitizedEnv,
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${description})`);
  }
  return decoder.decode(result.stdout).trim();
}

async function ensureBinary() {
  if (await Bun.file(binaryPath).exists()) {
    return;
  }
  console.log(
    'macOS binary missing. Building via `bun run build:bytecode:macos`...',
  );
  runCommand(['bun', 'run', 'build:bytecode:macos'], 'build:bytecode:macos');
}

async function createTarball() {
  runCommand(['rm', '-f', tarPath], 'remove stale tarball');
  console.log(`Packaging ${binaryPath} into ${tarName}...`);
  runCommand(
    ['tar', '-czf', tarPath, '-C', distDir, 'tsl'],
    'tar macOS artifact',
  );
}

function deriveRepoSlug() {
  if (Bun.env.HOMEBREW_GITHUB_SLUG) {
    return Bun.env.HOMEBREW_GITHUB_SLUG;
  }
  const remoteUrl = runCommand(
    ['git', 'config', '--get', 'remote.origin.url'],
    'read git remote',
  );
  if (remoteUrl.startsWith('git@github.com:')) {
    return remoteUrl.replace('git@github.com:', '').replace(/\.git$/, '');
  }
  const httpsPrefix = 'https://github.com/';
  if (remoteUrl.startsWith(httpsPrefix)) {
    return remoteUrl.replace(httpsPrefix, '').replace(/\.git$/, '');
  }
  throw new Error('Unable to determine GitHub slug. Set HOMEBREW_GITHUB_SLUG.');
}

async function readPackageVersion() {
  const packageJson = (await Bun.file(`${repoRoot}/package.json`).json()) as {
    version?: string;
  };
  return packageJson.version ?? '0.0.0';
}

async function computeSha256() {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(await Bun.file(tarPath).arrayBuffer());
  return hasher.digest('hex');
}

function buildFormula({
  version,
  sha256,
  url,
  homepage,
}: {
  version: string;
  sha256: string;
  url: string;
  homepage: string;
}) {
  return `# Generated via \`bun run distribute:brew\`
class Tsl < Formula
  desc "Translate CLI powered by Effect/AI"
  homepage "${homepage}"
  url "${url}"
  version "${version}"
  sha256 "${sha256}"
  license "MIT"

  def install
    bin.install "tsl"
  end

  test do
    system "#{bin}/tsl", "--help"
  end
end
`;
}

async function main() {
  runCommand(['mkdir', '-p', distDir], 'create dist directory');
  await ensureBinary();
  await createTarball();

  const version = await readPackageVersion();
  const slug = deriveRepoSlug();
  const tag = Bun.env.HOMEBREW_RELEASE_TAG ?? `v${version}`;
  const downloadUrl =
    Bun.env.HOMEBREW_TARBALL_URL ??
    `https://github.com/${slug}/releases/download/${tag}/${tarName}`;
  const homepage = `https://github.com/${slug}`;
  const sha256 = await computeSha256();

  runCommand(['mkdir', '-p', formulaDir], 'create formula directory');
  const formula = buildFormula({ version, sha256, url: downloadUrl, homepage });
  await Bun.write(formulaPath, formula);

  console.log('Homebrew artifact ready:');
  console.log(` - Binary: ${binaryPath}`);
  console.log(` - Tarball: ${tarPath}`);
  console.log(` - Formula: ${formulaPath}`);
  console.log('Publish tarball + formula, then submit to your tap.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
