#!/usr/bin/env bash
# Print health + readiness (commit SHA / build identity).
set -euo pipefail
API="${API_URL:-http://127.0.0.1:3001}"
echo "GET $API/api/v1/health"
curl -sS -D - "$API/api/v1/health" -o /tmp/amber-health.json
echo
cat /tmp/amber-health.json
echo
echo
echo "GET $API/api/v1/ready"
curl -sS -D - "$API/api/v1/ready" -o /tmp/amber-ready.json
echo
cat /tmp/amber-ready.json
echo
echo
echo "correlation echo (response header x-correlation-id):"
curl -sS -D - -o /dev/null -H "x-correlation-id: bruno-local-rc" "$API/api/v1/health" | tr -d '\r' | grep -i x-correlation-id || true
