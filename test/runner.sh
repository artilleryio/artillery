#!/usr/bin/env bash

# set -eu -o pipefail

echo "# starting target"
&>/dev/null PORT=3003 node ./test/core/targets/simple.js &
target_pid=$!
&>/dev/null node ./test/gh_215_target.js &
target2_pid=$!

until $(curl --output /dev/null --silent --fail http://localhost:3003); do
  printf '.'
  sleep 1
done

echo "# running tests"
echo

bats --tap ./test/testcases/*.bats

status=$?

echo "# done"
kill $target_pid
kill $target2_pid

exit $status
