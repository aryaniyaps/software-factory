import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createTemporalWorker } from "./worker.js";
import { TASK_QUEUES } from "./task-queues.js";
import { createVerifierActivities } from "./activities/verifier-impl.js";

export async function startVerifierWorkers(): Promise<void> {
  const hiddenScenariosRoot = process.env.FACTORY_HIDDEN_SCENARIOS_ROOT
    ?? join(process.cwd(), "factory/hidden-scenarios");
  const verifier = createVerifierActivities({ hiddenScenariosRoot });
  const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));
  const worker = await createTemporalWorker({
    taskQueue: TASK_QUEUES.verifier,
    workflowsPath,
    activities: { runBehavioralVerification: verifier.runBehavioralVerification },
  });
  await worker.run();
}
