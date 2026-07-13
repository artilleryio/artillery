#!/usr/bin/env bash

set -eu -o pipefail
typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

MOCKINGJAY_VERSION="1.12.0"

#
# Start mock server
#

cleanup() {
    container_id=$(docker container ls -aqf "name=mockingjay")

    (docker stop mockingjay && docker rm "$container_id") || true
}

trap cleanup EXIT

docker run --name mockingjay -p 9099:9090 -v "$DIR":/data "quii/mockingjay-server:$MOCKINGJAY_VERSION" --config /data/mock-pets-server.yaml &

# Wait for the mock server to accept connections. A fixed sleep is racy:
# if the image needs pulling, the first test can run against a dead port
# and fail with ECONNREFUSED.
for _i in $(seq 1 60); do
    if curl -sf -o /dev/null "http://localhost:9099/pets"; then
        break
    fi
    sleep 1
done

if ! curl -sf -o /dev/null "http://localhost:9099/pets"; then
    echo "mockingjay server did not become ready in time" >&2
    exit 1
fi

node --test --test-timeout=120000 --require "$DIR"/setup-env.cjs "$DIR"/index.js "$DIR"/lib/formatters.js
