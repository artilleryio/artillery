#!/usr/bin/env bash

echo "starting target"
node ./test/target.js &
target_pid=$!

echo "running tests"
echo

bats ./test/test.sh

echo "done"
kill $target_pid
