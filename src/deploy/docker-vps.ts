export interface DeploymentExecutor {
  run(host: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  health(host: string, port: number): Promise<boolean>;
}

export class DockerVpsDeployer {
  constructor(private readonly executor: DeploymentExecutor) {}

  async deploy(input: { host: string; image: string; previousImage?: string; port: number }): Promise<void> {
    if (!/^.+@sha256:[a-f0-9]{3,}$/i.test(input.image)) throw new Error("deployment requires an immutable image digest");
    await this.run(input.host, ["docker", "pull", input.image]);
    await this.run(input.host, ["docker", "rm", "-f", "factory-app"]);
    await this.run(input.host, ["docker", "run", "-d", "--name", "factory-app", input.image]);
    if (await this.executor.health(input.host, input.port)) return;

    await this.run(input.host, ["docker", "rm", "-f", "factory-app"]);
    if (!input.previousImage) throw new Error("health check failed and no previous image is available");
    await this.run(input.host, ["docker", "run", "-d", "--name", "factory-app", input.previousImage]);
    throw new Error("health check failed; rolled back");
  }

  private async run(host: string, args: string[]): Promise<void> {
    const result = await this.executor.run(host, args);
    if (result.exitCode !== 0) throw new Error(`deployment command failed: ${args.join(" ")}`);
  }
}
