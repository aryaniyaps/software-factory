import { pathToFileURL } from "node:url";

const modulePath = process.env.FACTORY_WORKER_MODULE;
if (!modulePath) throw new Error("FACTORY_WORKER_MODULE is required");

const workerModule = await import(pathToFileURL(modulePath).href) as { startWorkers?: () => Promise<void> };
if (!workerModule.startWorkers) throw new Error("FACTORY_WORKER_MODULE must export startWorkers()");
await workerModule.startWorkers();
