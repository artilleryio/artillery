#!/usr/bin/env bash

set -eu -o pipefail

if [ -z ${CIRCLE_TAG:-""} ] ; then
    echo "No tag, not doing anything"
    exit 0
fi

echo "Publishing package on npm for $CIRCLE_TAG"

if [[ ${CIRCLE_TAG} == *"-dev"* ]] ; then
    npm publish --tag dev
else
    echo "npm publish"
    npm publish
fi
