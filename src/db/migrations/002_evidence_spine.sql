CREATE TABLE IF NOT EXISTS factory_node_attempts (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  node TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  failure_code TEXT,
  evidence_manifest_hash TEXT,
  PRIMARY KEY (run_id, attempt_id)
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  node_attempt_id TEXT,
  model TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, session_id)
);

CREATE TABLE IF NOT EXISTS agent_turns (
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  transcript_uri TEXT,
  transcript_sha256 TEXT,
  PRIMARY KEY (run_id, session_id, turn_id),
  FOREIGN KEY (run_id, session_id) REFERENCES agent_sessions(run_id, session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_calls (
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  output_sha256 TEXT,
  input_uri TEXT NOT NULL,
  output_uri TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, session_id, turn_id, call_id),
  FOREIGN KEY (run_id, session_id, turn_id) REFERENCES agent_turns(run_id, session_id, turn_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_items (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  media_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  uri TEXT NOT NULL,
  producer_type TEXT NOT NULL,
  producer_id TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  subject JSONB NOT NULL DEFAULT '{}',
  redaction TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (run_id, id)
);

CREATE TABLE IF NOT EXISTS gate_decisions (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  gate_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  reasons JSONB NOT NULL,
  evidence_refs JSONB NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, gate_id, decided_at)
);

CREATE TABLE IF NOT EXISTS scenario_runs (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  status TEXT NOT NULL,
  satisfaction REAL,
  trajectory_uri TEXT,
  trajectory_sha256 TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, scenario_id, attempt_id)
);

CREATE TABLE IF NOT EXISTS fitness_results (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL,
  report_uri TEXT,
  report_sha256 TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, rule_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS deployment_observations (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  profile TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  signal_uri TEXT,
  signal_sha256 TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, profile, observation_id)
);

CREATE TABLE IF NOT EXISTS incident_links (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL,
  source TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, incident_id)
);

CREATE TABLE IF NOT EXISTS feedback_items (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  feedback_id TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, feedback_id)
);

CREATE TABLE IF NOT EXISTS oracle_calibrations (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  oracle_id TEXT NOT NULL,
  calibration_id TEXT NOT NULL,
  score REAL NOT NULL,
  report_uri TEXT,
  report_sha256 TEXT,
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, oracle_id, calibration_id)
);

CREATE TABLE IF NOT EXISTS evidence_manifests (
  run_id TEXT PRIMARY KEY REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  manifest_hash TEXT NOT NULL,
  manifest JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_event_outbox (
  run_id TEXT NOT NULL REFERENCES factory_runs(run_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, event_id)
);

CREATE INDEX IF NOT EXISTS evidence_items_run_created_idx ON evidence_items(run_id, created_at);
CREATE INDEX IF NOT EXISTS gate_decisions_run_decided_idx ON gate_decisions(run_id, decided_at);
CREATE INDEX IF NOT EXISTS factory_event_outbox_run_created_idx ON factory_event_outbox(run_id, created_at);
