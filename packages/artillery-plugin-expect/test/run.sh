#!/usr/bin/env bash

set -eu -o pipefail
typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

MOCKINGJAY_VERSION="1.10.7"

#
# Start mock server
#

mock_server_pid=
mock_server_status=

cleanup() {
    kill $mock_server_pid
}

trap cleanup EXIT

if [[ ! -z ${CIRCLECI:-""} ]] ; then
    curl -L -o mockingjay-server "https://github.com/quii/mockingjay-server/releases/download/$MOCKINGJAY_VERSION/linux_386_mockingjay-server"
    chmod +x mockingjay-server
    ./mockingjay-server --config ./test/mock-pets-server.yaml &
    mock_server_pid=$!
    mock_server_status=$?
else
    docker run --rm -p 9090:9090 -v "$DIR":/data "quii/mockingjay-server:$MOCKINGJAY_VERSION" --config /data/mock-pets-server.yaml &
    mock_server_pid=$!
    mock_server_status=$?
fi

if [[ $mock_server_status -ne 0 ]] ; then
    echo "Could not start mock server"
    exit 1
fi

sleep 5

"$DIR"/../node_modules/.bin/ava $DIR/index.js $DIR/lib/formatters.js
