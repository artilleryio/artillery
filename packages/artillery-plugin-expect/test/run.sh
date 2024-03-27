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

sleep 10

"$DIR"/../../../node_modules/.bin/tap --timeout 120
