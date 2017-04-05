#!/usr/bin/env bash

echo "starting target"
node ./test/target.js &
target_pid=$!
node ./test/gh_215_target.js &
target2_pid=$!

echo "running tests"
echo

bats ./test/test.bats ./test/test-variables-from-external-files.bats
status=$?

echo "done"
kill $target_pid
kill $target2_pid

exit $status
