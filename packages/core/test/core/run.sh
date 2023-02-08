#!/bin/bash

set -e

typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

SILENT=true node $DIR/targets/simple.js &
node $DIR/targets/simple_ws.js &
node $DIR/targets/simple_socketio.js &
node $DIR/targets/express_socketio.js &
node $DIR/targets/ws_tls.js &
node $DIR/targets/ws_proxy.js &

cleanup() {
    kill $(ps aux|grep simple.js|grep node|awk '{print $2}') || true
    kill $(ps aux|grep simple_ws.js|grep node|awk '{print $2}') || true
    kill $(ps aux|grep simple_socketio.js|grep node|awk '{print $2}') || true
    kill $(ps aux|grep express_socketio.js|grep node|awk '{print $2}') || true
    kill $(ps aux|grep ws_tls.js|grep node|awk '{print $2}') || true
    kill $(ps aux|grep ws_proxy.js|grep node|awk '{print $2}') || true
}

trap cleanup EXIT


if [ $# -eq 1 ] ; then
    echo Running Single Test: $1
    node $DIR/$1
else
    echo Running All Available Tests
    node $DIR/index.js
fi

test_status=$?
exit $test_status
