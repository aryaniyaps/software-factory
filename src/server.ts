import { createApplication } from "./container.js";

const port = Number(process.env.FACTORY_PORT ?? 8787);
const app = await createApplication({
  workspaceMode: process.env.WORKSPACE_MODE === "production" ? "production" : "test",
  arbitraryCode: process.env.ARBITRARY_CODE === "true",
  provider: process.env.WORKSPACE_PROVIDER === "sandbox" ? "sandbox" : "process",
});

app.api.listen(port, () => {
  console.log(`software-factory listening on :${port}`);
});
