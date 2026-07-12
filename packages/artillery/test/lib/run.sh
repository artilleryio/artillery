#!/bin/bash

typeset -r DIR=$(cd "$(dirname "$0")" && pwd)

node --test "$DIR"/index.js

test_status=$?

exit $test_status
