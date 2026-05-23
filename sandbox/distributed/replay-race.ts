export interface ReplayMutation {
  mutationId: string;
  replicaId: string;
  timestamp: number;
}

export function simulateReplayRace(): ReplayMutation[] {
  return [
    {
      mutationId: "mutation-001",
      replicaId: "Replica-A",
      timestamp: Date.now(),
    },
    {
      mutationId: "mutation-001",
      replicaId: "Replica-B",
      timestamp: Date.now() + 5,
    },
  ];
}

console.log(simulateReplayRace());
