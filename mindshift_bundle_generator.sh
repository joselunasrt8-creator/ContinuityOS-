#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MESSAGE'
Legacy mindshift_bundle_generator.sh helper disabled.

This root helper is non-authoritative and cannot create runtime objects
or deployment bundles. Use the canonical runtime spine:
/session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof.
MESSAGE

exit 1
