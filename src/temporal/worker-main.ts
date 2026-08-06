import { createTemporalWorker } from "./worker.js";
import { TASK_QUEUES } from "./task-queues.js";

export interface ProductionWorker {
  run(): Promise<void>;
}

export interface ProductionWorkerOptions {
  workflowsPath: string;
  activities: Record<string, (...args: any[]) => Promise<any>>;
  createWorker?: (options: { taskQueue: string; workflowsPath: string; activities: Record<string, (...args: any[]) => Promise<any>> }) => Promise<ProductionWorker>;
}

const DEDICATED_QUEUE_ACTIVITIES: Record<Exclude<keyof typeof TASK_QUEUES, "control">, ReadonlySet<string>> = {
  agent: new Set(["runAgent"]),
  build: new Set(["runChecks", "runFitnessAssessment", "buildArtifact"]),
  verifier: new Set(["runBehavioralVerification"]),
  deploy: new Set([
    "deployPreview",
    "verifyRelease",
    "deployCanary",
    "observeDeployment",
    "rollbackDeployment",
    "getDeploymentTarget",
    "deploy",
    "healthCheck",
  ]),
};

const NON_CONTROL_ACTIVITIES = new Set(
  Object.values(DEDICATED_QUEUE_ACTIVITIES).flatMap((names) => [...names]),
);

export function activitiesForQueue(
  taskQueue: string,
  activities: Record<string, (...args: any[]) => Promise<any>>,
): Record<string, (...args: any[]) => Promise<any>> {
  if (taskQueue === TASK_QUEUES.control) {
    return Object.fromEntries(Object.entries(activities).filter(([name]) => !NON_CONTROL_ACTIVITIES.has(name)));
  }

  const dedicatedKey = (Object.keys(DEDICATED_QUEUE_ACTIVITIES) as Array<keyof typeof DEDICATED_QUEUE_ACTIVITIES>)
    .find((key) => TASK_QUEUES[key] === taskQueue);
  if (!dedicatedKey) return {};
  const allowed = DEDICATED_QUEUE_ACTIVITIES[dedicatedKey];
  return Object.fromEntries(Object.entries(activities).filter(([name]) => allowed.has(name)));
}

export async function createProductionWorkers(options: ProductionWorkerOptions): Promise<ProductionWorker[]> {
  const createWorker = options.createWorker ?? createTemporalWorker;
  return Promise.all(Object.values(TASK_QUEUES).map((taskQueue) => createWorker({
    taskQueue,
    workflowsPath: options.workflowsPath,
    activities: activitiesForQueue(taskQueue, options.activities),
  })));
}

export async function runProductionWorkers(options: ProductionWorkerOptions): Promise<void> {
  await Promise.all((await createProductionWorkers(options)).map((worker) => worker.run()));
}
