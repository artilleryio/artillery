#!/bin/bash

typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

SILENT=true node $DIR/targets/simple.js &
simple_pid=$!
node $DIR/targets/simple_ws.js &
ws_pid=$!
node $DIR/targets/simple_socketio.js &
io_pid=$!
node $DIR/targets/express_socketio.js &
express_pid=$!
node $DIR/targets/ws_tls.js &
ws_tls_pid=$!


if [ $# -eq 1 ] ; then
    echo Running Single Test: $1
     $1
else
    echo Running All Available Tests
    node $DIR/index.js
fi

test_status=$?


kill $simple_pid
kill $ws_pid
kill $io_pid
kill $express_pid
kill $ws_tls_pid

exit $test_status
