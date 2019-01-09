#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

#
# We make sure that the CSV files are read and parsed properly by constructing
# URLs and payloads from the contents of those files. If we see any 400s in the
# log we know something went wrong.
#

@test "Single CSV, path passed in with a flag" {
    PORT=1986 node ./test/targets/calc-server.js &
    target_pid=$!

    REPORT=single-external-file-report.json

    ./bin/artillery run --target "http://localhost:1986" -e "single-cli" ./test/scripts/test-calc-server.yml -p ./test/data/calc-test-data-1.csv -o $REPORT

    kill $target_pid

    num200=`jq '.aggregate.codes."200"' $REPORT`
    num400=`jq '.aggregate.codes."400"' $REPORT`
    rm "$REPORT" || true
    [[ $num200 = 10  &&  num400  -eq "null" ]]
}

# @test "Single CSV, path specified inside the script" {
#     [[ true ]]
# }
