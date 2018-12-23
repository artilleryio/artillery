#!/usr/bin/sh

set -eu -o pipefail

if [ -z ${CIRCLE_TAG:-""} ] ; then
    exit 0
fi

if [ $CIRCLE_BRANCH != "master" ] ; then
    exit 0
fi

echo "Building Docker image for tag $CIRCLE_TAG on $CIRCLE_BRANCH"

docker build -t artilleryio/artillery:$CIRCLE_TAG .

docker run --rm -it artilleryio/artillery:$CIRCLE_TAG quick -d 20 -c 10 -n 20 https://artillery.io/

echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin

docker push artilleryio/artillery:$CIRCLE_TAG
