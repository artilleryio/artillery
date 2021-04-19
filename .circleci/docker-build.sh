#!/usr/bin/sh

set -eu -o pipefail

echo "Building Docker image for tag $CIRCLE_TAG"

docker build -t artilleryio/artillery:$CIRCLE_TAG .

docker run --rm -it artilleryio/artillery:$CIRCLE_TAG dino

echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin

# If the tagged release is not a dev release, tag it as the latest.
if [[ ${CIRCLE_TAG} != *"-dev"* ]] ; then
    docker tag artilleryio/artillery:$CIRCLE_TAG artilleryio/artillery:latest
fi

docker push artilleryio/artillery --all-tags
