export interface ReplicaState {
  replicaId: string;
  continuityId: string;
  continuityStatus: "VALID" | "REVOKED";
  lastSync: number;
}

export function simulatePartition(): ReplicaState[] {
  const replicaA: ReplicaState = {
    replicaId: "Replica-A",
    continuityId: "continuity-001",
    continuityStatus: "REVOKED",
    lastSync: Date.now(),
  };

  const replicaB: ReplicaState = {
    replicaId: "Replica-B",
    continuityId: "continuity-001",
    continuityStatus: "VALID",
    lastSync: Date.now() - 60000,
  };

  return [replicaA, replicaB];
}

console.log(simulatePartition());
