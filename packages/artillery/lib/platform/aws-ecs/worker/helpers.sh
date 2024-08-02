#!/usr/bin/env bash

ARTIFACTORY_AUTH="${ARTIFACTORY_AUTH:-"null"}"
ARTIFACTORY_EMAIL="${ARTIFACTORY_EMAIL:-"null"}"
NPM_REGISTRY="${NPM_REGISTRY:-"null"}"
NPM_TOKEN="${NPM_TOKEN:-"null"}"
NPM_SCOPE="${NPM_SCOPE:-"null"}"
NPMRC="${NPMRC:-"null"}"

generate_npmrc () {
    if [[ "$ARTIFACTORY_AUTH" != "null" ]] && [[ "$ARTIFACTORY_EMAIL" != "null" ]] ; then
        echo "_auth=$ARTIFACTORY_AUTH"
        echo "email=$ARTIFACTORY_EMAIL"
        echo "always-auth=true"
    else
        # If only one is set - print a diagnostic message;
        # otherwise neither is set so do nothing.
        if [[ "$ARTIFACTORY_AUTH" != "null" ]] || [[ "$ARTIFACTORY_EMAIL" != "null" ]] ; then
            echo "Both ARTIFACTORY_AUTH and ARTIFACTORY_EMAIL must be set for Artifactory auth to work"
        fi
    fi

    # NOTE: Default value for NPM_SCOPE and NPM_TOKEN is "null"
    if [[ "$NPM_REGISTRY" == "null" ]] ; then
       NPM_REGISTRY="https://registry.npmjs.org/"
    fi

    NPM_REGISTRY_BASE="${NPM_REGISTRY#http:}"
    NPM_REGISTRY_BASE="${NPM_REGISTRY#https:}"

    NPM_TOKEN="${NPM_TOKEN:-"null"}"
    NPM_SCOPE="${NPM_SCOPE:-"null"}"

    # Set registry URL:
    # npm config set registry "$NPM_REGISTRY"
    echo "registry=${NPM_REGISTRY}"

    if [[ ! "$NPM_TOKEN" = "null" ]] ; then
        echo "${NPM_REGISTRY_BASE}:_authToken=${NPM_TOKEN}"
    fi

    if [[ "$NPM_SCOPE" != "null" ]] ; then
        if [[ "$NPM_SCOPE_REGISTRY" != "null" ]] ; then
            echo "${NPM_SCOPE}:registry=${NPM_SCOPE_REGISTRY}"
        else
            # npm config set "${NPM_SCOPE}:registry" "$NPM_REGISTRY"
            echo "${NPM_SCOPE}:registry=${NPM_REGISTRY}"
        fi
    fi

    # Any extra bits from the user:
    if [[ "$NPMRC" != "null" ]] ; then
        echo "$NPMRC"
    fi
}

base64d () {
    # Not expecting any tabs or newlines in the input so not read'ing in a loop.
    read encoded
    if [[ "$(uname)" == "Darwin" ]] ; then
        printf "%s" "$encoded" | base64 -D
    elif [[ "$(uname)" == "Linux" ]] ; then
        printf "%s" "$encoded" | base64 -d
    else
        printf "Unknown platform: $(uname)"
        # shellcheck disable=SC2034
        EXIT_CODE=$ERR_UNKNOWN_PLATFORM
        exit
    fi
}

debug () {
    if [[ -n $DEBUG ]] ; then
        printf -- "%s\\n" "$@"
    fi
}

progress () {
    printf "******** [$worker_id] %s\\n" "$1"
}
