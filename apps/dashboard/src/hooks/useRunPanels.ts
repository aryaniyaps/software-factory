import { useCallback, useEffect, useState } from "react";
import * as api from "../api/client";
import type {
  DeploymentView,
  EvidenceItemView,
  GateDecisionView,
  ProbeRunView,
  ScenarioRunView,
} from "../types";
import { usePolling } from "./usePolling";

export interface RunPanelData {
  gates: GateDecisionView[];
  evidence: EvidenceItemView[];
  scenarios: ScenarioRunView[];
  probes: ProbeRunView[];
  deployments: DeploymentView[];
}

export function useRunPanels(runId: string | null, intervalMs = 8000) {
  const [data, setData] = useState<RunPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setLoading(Boolean(runId));
  }, [runId]);

  const refresh = useCallback(async () => {
    if (!runId) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const [gatesPage, evidencePage, scenariosPage, probesPage, deployments] = await Promise.all([
        api.getRunGates(runId),
        api.listEvidence(runId),
        api.getRunScenarios(runId),
        api.getRunProbes(runId),
        api.getRunDeployments(runId),
      ]);
      setData({
        gates: [...gatesPage.items],
        evidence: [...evidencePage.items],
        scenarios: [...scenariosPage.items],
        probes: [...probesPage.items],
        deployments: [...deployments.items],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  usePolling(refresh, {
    intervalMs,
    enabled: Boolean(runId),
    pauseWhenHidden: true,
  });

  return { data, error, loading, refresh };
}
