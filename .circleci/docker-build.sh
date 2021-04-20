#!/usr/bin/sh

set -eu -o pipefail

if [ -z ${CIRCLE_TAG:-""} ] ; then
    echo "No tag, not doing anything"
    exit 0
fi

DOCKER_TAG=${CIRCLE_TAG#v}

echo "Building Docker image for tag $DOCKER_TAG"

docker build -t artilleryio/artillery:$DOCKER_TAG .

docker run --rm -it artilleryio/artillery:$DOCKER_TAG dino

echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin

# If the tagged release is not a dev release, tag it as the latest.
if [[ ${DOCKER_TAG} != *"-dev"* ]] ; then
    docker tag artilleryio/artillery:$DOCKER_TAG artilleryio/artillery:latest
fi

docker push artilleryio/artillery --all-tags
