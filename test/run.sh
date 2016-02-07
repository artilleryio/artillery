#!/bin/bash

node test/targets/simple.js &
simple_pid=$!
node test/targets/simple_ws.js &
ws_pid=$!
node test/index.js
test_status=$?
kill $simple_pid
kill $ws_pid
exit $test_status
