#!/usr/bin/env bash

set -eu -o pipefail
typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

MOCKINGJAY_VERSION="1.12.0"

#
# Start mock server
#

mock_server_pid=
mock_server_status=

cleanup() {
    kill $mock_server_pid || true
    docker stop mockingjay || true
}

trap cleanup EXIT

if [[ ! -z ${CIRCLECI:-""} ]] ; then
    curl -L -o mockingjay-server "https://github.com/quii/mockingjay-server/releases/download/$MOCKINGJAY_VERSION/linux_386_mockingjay-server"
    chmod +x mockingjay-server
    ./mockingjay-server --config ./test/mock-pets-server.yaml &
    mock_server_pid=$!
else
    docker run --name mockingjay -p 9090:9090 -v "$DIR":/data "quii/mockingjay-server:$MOCKINGJAY_VERSION" --config /data/mock-pets-server.yaml &
fi

sleep 10

"$DIR"/../../../node_modules/.bin/ava $DIR/index.js $DIR/lib/formatters.js
