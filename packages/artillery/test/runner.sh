#!/usr/bin/env bash

# set -eu -o pipefail

echo "# starting target"
&>/dev/null PORT=3003 node ./test/core/targets/simple.js &
target_pid=$!
&>/dev/null node ./test/gh_215_target.js &
target2_pid=$!

echo "# running tests"
echo

bats --tap ./test/testcases/*.bats

status=$?

echo "# done"
kill $target_pid
kill $target2_pid

exit $status
