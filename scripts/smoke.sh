#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://127.0.0.1:3001}"
LOCAL_KEY="${LOCAL_KEY:-}"

curl_auth() {
  if [[ -n "$LOCAL_KEY" ]]; then
    curl -s "$@" -H "Authorization: Bearer $LOCAL_KEY"
  else
    curl -s "$@"
  fi
}

echo "==> smoke against $BASE"

code=$(curl -s -o /tmp/smoke_health.json -w "%{http_code}" "$BASE/health")
[[ "$code" == "200" ]] || { echo "FAIL /health $code"; exit 1; }
echo "OK /health"

code=$(curl_auth -o /tmp/smoke_models.json -w "%{http_code}" "$BASE/v1/models")
[[ "$code" == "200" ]] || { echo "FAIL /v1/models $code"; exit 1; }
echo "OK /v1/models"

# empty probe (Codex health check shape)
code=$(curl_auth -o /tmp/smoke_probe.json -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"model":"glm-5.1"}' \
  "$BASE/v1/responses")
[[ "$code" == "200" ]] || { echo "FAIL probe $code"; cat /tmp/smoke_probe.json; exit 1; }
echo "OK empty probe"

code=$(curl -s -o /tmp/smoke_config.json -w "%{http_code}" "$BASE/config")
[[ "$code" == "200" ]] || { echo "FAIL /config $code"; exit 1; }
echo "OK /config"

node -e "
const c = JSON.parse(require('fs').readFileSync('/tmp/smoke_config.json', 'utf8'));
if (!Array.isArray(c.providerPresets) || c.providerPresets.length < 6) {
  console.error('FAIL providerPresets missing or too few');
  process.exit(1);
}
for (const id of ['agentrouter', 'mimo-cn']) {
  if (!c.providerPresets.some(p => p.id === id)) {
    console.error('FAIL providerPresets missing', id);
    process.exit(1);
  }
}
"

echo "OK providerPresets"

code=$(curl -s -o /tmp/smoke_stats.json -w "%{http_code}" "$BASE/stats")
[[ "$code" == "200" ]] || { echo "FAIL /stats $code"; exit 1; }
echo "OK /stats"

echo "All smoke checks passed."
