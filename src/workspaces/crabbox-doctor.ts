import { officialCrabboxCommandRunner, type CrabboxCommandRunner } from "./crabbox-runtime.js";

export async function assertCrabboxAvailable(
  runner: CrabboxCommandRunner = officialCrabboxCommandRunner,
  bin = process.env.CRABBOX_BIN ?? "crabbox",
): Promise<void> {
  const result = await runner.run(bin, ["--version"]);
  if (result.exitCode !== 0) {
    throw new Error(`Crabbox is required for repository commands but '${bin}' is unavailable. Install Crabbox and Docker or Podman on the worker host. ${result.stderr || result.stdout}`.trim());
  }
}
