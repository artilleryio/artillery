#!/usr/bin/env bash

set -eu -o pipefail
typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

docker run --rm -p 9090:9090 -v "$DIR":/data quii/mockingjay-server:1.10.7 --config /data/mock-pets-server.yaml &
docker_pid=$!
docker_status=$?

if [[ $docker_status -ne 0 ]] ; then
    echo "Could not start mock server"
    exit 1
fi

sleep 5

test_status=$("$DIR"/../node_modules/.bin/ava $DIR/index.js)

kill $docker_pid
sleep 5

exit $test_status
