#!/usr/bin/env bash
set -euo pipefail

# MindShift Bundle Generator (Hash-Based Signing Version)
# Fully aligned with the corrected validator (signature over hash)

# Allow overriding key paths for different projects/founders
PRIVATE_KEY="${PRIVATE_KEY:-founder_private.pem}"
PUBLIC_KEY="${PUBLIC_KEY:-founder_public.pem}"

DECISION_ID="MS-RUNTIME-ACTIVATION-001"
ACTIVATION_ID="ACT-MS-RUNTIME-ACTIVATION-001"
SIGNER="human_founder"
ALGORITHM="ed25519"

DEPLOY_JSON="deploy_aeo.json"
CANONICAL_JSON="deploy_aeo.canonical.json"
HASH_FILE="aeo_hash.txt"
SIG_BIN="signature.bin"
SIG_B64="signature.b64"
RECEIPT_JSON="activation_receipt.json"
BUNDLE_JSON="fulfillment_bundle.json"

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

hash_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd python3
require_cmd openssl
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "Missing required command: sha256sum or shasum" >&2
  exit 1
fi

# 1. Create deploy_aeo.json
cat > "$DEPLOY_JSON" <<'JSON'
{
  "intent": "deploy_service",
  "scope": {
    "service": "api",
    "environment": "production",
    "repository": "mindshift-demo",
    "branch": "main"
  },
  "validation": {
    "decision_id": "MS-RUNTIME-ACTIVATION-001",
    "require_signature": true,
    "require_exact_object_match": true,
    "enforce_constraints": true,
    "within_expiry_window": true
  },
  "target": {
    "system": "github_actions",
    "action": "deploy"
  },
  "finality": {
    "proof_required": true,
    "proof_type": "deployment_receipt"
  }
}
JSON

# 2. Create canonical version (using variables)
python3 <<PY
import json
with open("${DEPLOY_JSON}", "r", encoding="utf-8") as f:
    obj = json.load(f)
canonical = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
with open("${CANONICAL_JSON}", "w", encoding="utf-8") as f:
    f.write(canonical)
PY

# Hardening: Ensure canonical file is not empty
[[ -s "$CANONICAL_JSON" ]] || { echo "❌ Canonical JSON is empty" >&2; exit 1; }

# 3. Compute hash
AEO_HASH="$(hash_file "$CANONICAL_JSON")"
printf '%s' "$AEO_HASH" > "$HASH_FILE"

# Hardening: Validate hash is proper 64-character hex
[[ ${#AEO_HASH} -eq 64 ]] || { echo "❌ Invalid SHA-256 hash length" >&2; exit 1; }
[[ "$AEO_HASH" =~ ^[0-9a-f]{64}$ ]] || { echo "❌ Invalid SHA-256 hex value" >&2; exit 1; }

# 4. Generate or use existing Ed25519 keypair
if [[ ! -f "$PRIVATE_KEY" || ! -f "$PUBLIC_KEY" ]]; then
  echo "🔑 Generating new Ed25519 keypair: $PRIVATE_KEY / $PUBLIC_KEY"
  openssl genpkey -algorithm Ed25519 -out "$PRIVATE_KEY"
  openssl pkey -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY"
else
  echo "🔑 Using existing keypair: $PRIVATE_KEY"
fi

# 5. Sign the HASH string (matches validator model)
printf '%s' "$AEO_HASH" | openssl pkeyutl -sign -rawin -inkey "$PRIVATE_KEY" -out "$SIG_BIN"
openssl base64 -A -in "$SIG_BIN" -out "$SIG_B64"

# 6. Auto-verify signature immediately
if ! printf '%s' "$AEO_HASH" | \
     openssl pkeyutl -verify -rawin -pubin -inkey "$PUBLIC_KEY" -sigfile "$SIG_BIN" >/dev/null 2>&1; then
  echo "❌ Signature verification failed after signing!" >&2
  exit 1
fi
echo "✅ Signature verified successfully"

TIMESTAMP="$(timestamp_utc)"

# 7. Generate receipt and fulfillment bundle
python3 <<PY
import json
from pathlib import Path

decision_id = "${DECISION_ID}"
activation_id = "${ACTIVATION_ID}"
signer = "${SIGNER}"
algorithm = "${ALGORITHM}"
timestamp = "${TIMESTAMP}"

aeo_hash = Path("${HASH_FILE}").read_text(encoding="utf-8").strip()
canonical = Path("${CANONICAL_JSON}").read_text(encoding="utf-8")
signature_b64 = Path("${SIG_B64}").read_text(encoding="utf-8").strip()
public_key = Path("${PUBLIC_KEY}").read_text(encoding="utf-8")

receipt = {
    "activation_id": activation_id,
    "decision_id": decision_id,
    "object_hash": aeo_hash,
    "signer": signer,
    "algorithm": algorithm,
    "registry_state_before": "INACTIVE",
    "registry_state_after": "ACTIVE",
    "verification_result": "VALID",
    "timestamp": timestamp
}

bundle = {
    "canonical_deploy_aeo": canonical,
    "aeo_hash": aeo_hash,
    "signature_value": signature_b64,
    "signer_public_key": public_key,
    "activation_receipt": receipt
}

Path("${RECEIPT_JSON}").write_text(
    json.dumps(receipt, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

Path("${BUNDLE_JSON}").write_text(
    json.dumps(bundle, indent=2, ensure_ascii=False),
    encoding="utf-8"
)
PY

echo "✅ MindShift Bundle Generated Successfully (Hash-Based Signing)"
echo
echo "Generated files:"
echo "  • $DEPLOY_JSON"
echo "  • $CANONICAL_JSON"
echo "  • $HASH_FILE"
echo "  • $PRIVATE_KEY"
echo "  • $PUBLIC_KEY"
echo "  • $SIG_BIN"
echo "  • $SIG_B64"
echo "  • $RECEIPT_JSON"
echo "  • $BUNDLE_JSON"
echo
echo "AEO Hash:"
cat "$HASH_FILE"
echo
echo "Local signature verification command:"
echo "  printf '%s' \"\$(cat aeo_hash.txt)\" | \\"
echo "  openssl pkeyutl -verify -rawin -pubin -inkey $PUBLIC_KEY -sigfile $SIG_BIN"
echo
echo "Submit to validator (full chain):"
echo "  curl -X POST http://localhost:3000/validate_bundle -H \"Content-Type: application/json\" --data @$BUNDLE_JSON"
echo "  curl -X POST http://localhost:3000/validate -H \"Content-Type: application/json\" --data @$CANONICAL_JSON"
echo "  curl -X POST http://localhost:3000/execute -H \"Content-Type: application/json\" --data @$CANONICAL_JSON"
echo "  curl -X POST http://localhost:3000/proof-of-transfer -H \"Content-Type: application/json\" -d '{\"decision_id\":\"MS-RUNTIME-ACTIVATION-001\",\"proof_type\":\"deployment_receipt\",\"receipt\":{\"execution_id\":\"REPLACE_WITH_REAL_EXECUTION_ID\",\"object_hash\":\"$(cat "$HASH_FILE")\",\"environment_url\":\"https://api.mindshift-demo.production\"}}'"
echo
echo "Your bundle is now cryptographically valid for the hash-based validator."