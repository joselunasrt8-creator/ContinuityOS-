export interface ReplicaDrift {
  replicaId: string;
  staleDurationMs: number;
  lineageDepth: number;
}

export function simulateStaleReplica(): ReplicaDrift {
  return {
    replicaId: "Replica-B",
    staleDurationMs: 300000,
    lineageDepth: 12,
  };
}

console.log(simulateStaleReplica());
