#!/bin/bash
# Poll registry.npmjs.org until a package version is fetchable.
# npm publish --provenance returns before the packument is queryable
# ("Your package is being processed and may take a few minutes").
# Uses curl so a stale npm packument cache cannot hide the version.

set -u

if [ $# -ne 2 ]; then
  echo "Usage: $0 <package> <version>"
  exit 1
fi

pkg="$1"
ver="$2"
url="https://registry.npmjs.org/${pkg}/${ver}"
max_attempts=30
sleep_time=10

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo "000")
  if [ "$code" = "200" ]; then
    echo "$pkg@$ver is available on the registry (attempt $attempt)"
    exit 0
  fi
  echo "Waiting for $pkg@$ver (HTTP $code, attempt $attempt/$max_attempts). Retry in ${sleep_time}s..."
  sleep "$sleep_time"
  attempt=$((attempt + 1))
done

echo "Timed out waiting for $pkg@$ver on the registry"
exit 1
