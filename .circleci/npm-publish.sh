#!/usr/bin/sh

set -eu -o pipefail

if [ -z ${CIRCLE_TAG:-""} ] ; then
    exit 0
fi

if [ $CIRCLE_BRANCH != "master" ] ; then
    exit 0
fi

echo "Publishing package on npm for $CIRCLE_TAG on $CIRCLE_BRANCH"

npm publish