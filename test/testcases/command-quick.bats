#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "Can specify output filename for artillery quick" {
  JSON_REPORT="$(mktemp -d)/report.json"
  ./bin/artillery quick -d 1 -r 1 -o $JSON_REPORT https://artillery.io | grep "Log file: $JSON_REPORT"
  [ $? -eq 0 ]
}

@test "'artillery quick' accepts a variety of options" {
    ./bin/artillery quick --duration 10 --rate 1 https://artillery.io/
    [ $? -eq 0 ]
}

@test "Quick: does not accept invalid combination of options" {
    set +e
    ./bin/artillery quick -c 10 -r 10 -n 50 https://artillery.io
    status1=$?
    ./bin/artillery quick -d 60 -n 50 https://artillery.io
    status2=$?
    set -e

    [[ $status1 -eq 1 && $status2 -eq 1 ]]
}

@test "Quick: specified number of requests is sent on each connection" {
    ./bin/artillery quick -c 25 -n 5 -o report.json http://localhost:3003/
    requestCount=$(jq .aggregate.requestsCompleted report.json)
    rm report.json

    [[ $requestCount -eq 125 ]]
}

@test "Should produce no output when run with --quiet" {
  output=$(./bin/artillery quick --quiet -d 1 -c 10 http://localhost:3003/)
  [[ -z "$output" ]]
}
