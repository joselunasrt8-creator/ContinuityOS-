export interface RevocationEvent {
  continuityId: string;
  revokedAt: number;
  replicaId: string;
  applied: boolean;
}

export function simulateRevocationDelay(): RevocationEvent[] {
  return [
    {
      continuityId: "continuity-001",
      revokedAt: Date.now(),
      replicaId: "Replica-A",
      applied: true,
    },
    {
      continuityId: "continuity-001",
      revokedAt: Date.now(),
      replicaId: "Replica-C",
      applied: false,
    },
  ];
}

console.log(simulateRevocationDelay());
