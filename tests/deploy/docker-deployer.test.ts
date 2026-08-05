import { describe, expect, it } from "vitest";
import { DockerVpsDeployer } from "../../src/deploy/docker-vps.js";

describe("DockerVpsDeployer", () => {
  it("deploys an immutable image and rolls back when health fails", async () => {
    const commands: string[] = [];
    const deployer = new DockerVpsDeployer({
      run: async (host, args) => { commands.push(`${host}: ${args.join(" ")}`); return { exitCode: 0, stdout: "", stderr: "" }; },
      health: async () => false,
    });
    await expect(deployer.deploy({ host: "vps", image: "registry/app@sha256:abc", previousImage: "registry/app@sha256:old", port: 8080 })).rejects.toThrow("health check failed");
    expect(commands).toEqual(expect.arrayContaining([
      "vps: docker pull registry/app@sha256:abc",
      "vps: docker run -d --name factory-app registry/app@sha256:abc",
      "vps: docker rm -f factory-app",
      "vps: docker run -d --name factory-app registry/app@sha256:old",
    ]));
  });
});
