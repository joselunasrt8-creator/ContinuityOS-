# MindShift Legitimacy Envelope v1

Legitimacy envelopes are portable, deterministic, signable containers for MindShift legitimacy objects. The invariant is: if no valid object exists, nothing happens.

Canonical envelope:

```json
{
  "envelope_type": "AEO",
  "schema_version": "1.0.0",
  "canonicalization": "JCS",
  "payload_hash": "sha256",
  "payload_type": "mindshift.aeo.v1",
  "payload": {},
  "continuity_id": "uuid",
  "trace_id": "otel_trace_id",
  "signature": { "dsse": {}, "signer": "authority_service" },
  "proof": { "receipt_id": "uuid", "transparency_log": "rekor", "timestamp": "iso8601" }
}
```

Alignment: identity may be represented by SPIFFE/SPIRE IDs, OAuth token exchange, and DPoP key binding; canonical serialization uses JCS; signatures use DSSE; provenance maps to in-toto and SLSA; receipts map to SCITT/Rekor; trace lineage maps to OpenTelemetry. MindShift adds the semantic layer of legitimacy continuity.

Object family: ATAO is a proposal only; AEO is exact executable legitimacy where validated_object equals executed_object; Continuity Object preserves identity, actor, delegation, revocation, replay, and hash lineage; PREO is merge/review legitimacy evidence; SCO governs system mutations; Proof Envelope is execution closure evidence.
