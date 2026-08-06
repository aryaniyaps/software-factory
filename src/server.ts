import { initTelemetry } from "./telemetry/bootstrap.js";

initTelemetry();
await import("./server-main.js").then((module) => module.startServer());
