#!/bin/bash
set -e

typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

if [ $# -eq 1 ] ; then
    echo Running Single Test: $1
    "$DIR"/../../../../node_modules/.bin/tap --no-coverage --color --timeout 600 $DIR/$1
else
    echo Running All Available Tests
    "$DIR"/../../../../node_modules/.bin/tap --no-coverage --color --timeout 600 $DIR/index.js
fi

test_status=$?
exit $test_status
