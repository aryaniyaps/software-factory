export interface BaseEnvelope {
  status: "success" | "fail";
  summary: string;
  artifacts: string[];
  notesForNextNode: string;
}

export function successEnvelope(summary: string, artifacts: string[] = []): BaseEnvelope {
  return { status: "success", summary, artifacts, notesForNextNode: "" };
}

export function failureEnvelope(summary: string, artifacts: string[] = []): BaseEnvelope {
  return { status: "fail", summary, artifacts, notesForNextNode: "" };
}
