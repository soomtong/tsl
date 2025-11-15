const messages: Record<string, string> = {
  publish: [
    "Step 3 – Publish release asset:",
    "1. Create or reuse a GitHub Release tag (default: v<package.json.version>).",
    "2. Upload dist/tsl-macos.tar.gz as an asset.",
    "3. If you use a custom tag or CDN URL, rerun `release:step2` with",
    "   HOMEBREW_RELEASE_TAG or HOMEBREW_TARBALL_URL so the formula matches.",
  ].join("\n"),
  tap: [
    "Step 4 – Update tap repository:",
    "1. Clone your tap repo (e.g., github.com/<owner>/homebrew-tsl).",
    "2. Copy dist/homebrew/tsl.rb into Formula/tsl.rb within that repo.",
    "3. Commit with a message like `Update tsl to <version>` and push to origin.",
  ].join("\n"),
  verify: [
    "Step 5 – Verify installation:",
    "1. On a clean machine, run `brew tap <owner>/tsl`.",
    "2. Run `brew install tsl`.",
    "3. Execute `tsl --help` to confirm the binary matches the new release.",
  ].join("\n"),
  automate: [
    "Step 6 – Automate future releases:",
    "1. Extend CI to run `release:step2` after tagging.",
    "2. Upload the tarball to the Release automatically.",
    "3. Open a PR to the tap repo (or push directly) with the refreshed formula.",
    "4. Optional: trigger brew tests to ensure the tap stays green.",
  ].join("\n"),
};

const order = ["publish", "tap", "verify", "automate"] as const;
const step = Bun.argv[2];

if (!step || step === "all") {
  for (const key of order) {
    console.log(messages[key]);
    console.log("");
  }
  process.exit(0);
}

if (!messages[step]) {
  console.log("Usage: bun run src/scripts/release-guide.ts [all|publish|tap|verify|automate]");
  process.exit(1);
}

console.log(messages[step]);

