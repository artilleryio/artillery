#!/usr/bin/env bash

set -eu -o pipefail

echo "Publishing package on npm for $CIRCLE_TAG"

if [[ ${CIRCLE_TAG} == *"-dev"* ]] ; then
    npm publish --tag dev
else
    echo "npm publish"
    npm publish
fi
