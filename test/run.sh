#!/bin/bash

SILENT=true node test/targets/simple.js &
simple_pid=$!
node test/targets/simple_ws.js &
ws_pid=$!
node test/targets/simple_socketio.js &
io_pid=$!
node test/targets/express_socketio.js &
express_pid=$!
node test/targets/ws_tls.js &
ws_tls_pid=$!


if [ $# -eq 1 ] ; then
    echo Running Single Test: $1
    node $1
else
    echo Running All Available Tests
    node test/index.js
fi

test_status=$?


kill $simple_pid
kill $ws_pid
kill $io_pid
kill $express_pid
kill $ws_tls_pid

exit $test_status
