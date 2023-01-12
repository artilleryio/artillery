#!/usr/bin/env bash

echo "# starting target"
&>/dev/null node ./test/gh_215_target.js &
target_pid=$!
&>/dev/null node ../core/test/core/targets/simple_socketio.js &
target2_pid=$!

echo "# running tests"
echo

bats --tap ./test/testcases/*.bats

status=$?

echo "# done"
kill $target_pid
kill $target2_pid

exit $status
