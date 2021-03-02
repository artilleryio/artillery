#!/usr/bin/env bash

set -eu -o pipefail

if [ -z ${CIRCLE_TAG:-""} ] ; then
    echo "No tag, not doing anything"
    exit 0
fi

if [ $CIRCLE_BRANCH != "master" ] ; then
    echo "Not on main branch, not doing anything"
    exit 0
fi

echo "Publishing package on npm for $CIRCLE_TAG on $CIRCLE_BRANCH"

npm publish