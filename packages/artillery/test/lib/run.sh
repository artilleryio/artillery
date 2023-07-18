#!/bin/bash

typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

./node_modules/.bin/tap $DIR/index.js --no-coverage --color

test_status=$?

exit $test_status
