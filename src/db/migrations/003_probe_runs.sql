CREATE TABLE IF NOT EXISTS probe_runs (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  probe_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  status TEXT NOT NULL,
  record JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, probe_id, attempt_id)
);

CREATE INDEX IF NOT EXISTS probe_runs_run_recorded_idx ON probe_runs(run_id, recorded_at);
