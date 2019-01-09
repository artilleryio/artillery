#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "Run a simple script" {
  ./bin/artillery run --config ./test/scripts/hello_config.json ./test/scripts/hello.json | grep 'All virtual users finished'
  [ $? -eq 0 ]
}

@test "Running with no target and no -e should exit with an error" {
  ./bin/artillery run test/scripts/environments.yaml | grep "No target"
  [ $? -eq 0 ]
}

@test "Environment specified with -e should be used" {
  # FIXME: Should not need to use "-k" here, see #59
  STATS="$(mktemp -d)/stats"
  ./bin/artillery run -k -e production -o "$STATS.json" test/scripts/environments2.json
  # TODO: Use jq
  # Here if the right environment is not picked up, we'll have a bunch of ECONNREFUSED errors in the report
  REPORT="$STATS.json" node -e 'var fs = require("fs");var j = JSON.parse(fs.readFileSync(process.env.REPORT));if(Object.keys(j.aggregate.errors).length !== 0) process.exit(1)'
  [ $? -eq 0 ]
}

@test "Run a script with one payload command line" {
  ./bin/artillery run ./test/scripts/single_payload.json -p ./test/scripts/pets.csv | grep 'All virtual users finished'
  [ $? -eq 0 ]
}

@test "Run a script with one payload json config" {
  ./bin/artillery run ./test/scripts/single_payload_object.json| grep 'All virtual users finished'
  [ $? -eq 0 ]
}

@test "Run a script with one payload json config with parse options passed" {
  ./bin/artillery run ./test/scripts/single_payload_options.json | grep 'All virtual users finished'
  [ $? -eq 0 ]
}

@test "Run a script with multiple payloads and use of $environment in path" {
  ./bin/artillery run -e local ./test/scripts/multiple_payloads.json | grep 'All virtual users finished'
  [ $? -eq 0 ]
}

@test "Run a script overwriting default options (output)" {
  ./bin/artillery run --config ./test/scripts/hello_config.json ./test/scripts/hello.json -o artillery_report_custom.json | grep 'Log file: artillery_report_custom.json'
  [ $? -eq 0 ]
}

@test "Script using hook functions" {
  ./bin/artillery run --config ./test/scripts/hello_config.json ./test/scripts/hello.json | grep 'hello from processor'
  [[ $? -eq 0 ]]
}

@test "Hook functions - can rewrite the URL" {
  # Ref: https://github.com/shoreditch-ops/artillery/issues/185
  ./bin/artillery run --config ./test/scripts/hello_config.json ./test/scripts/hello.json -o report.json
  node -e 'var fs = require("fs"); var j = JSON.parse(fs.readFileSync("report.json", "utf8"));process.exit(j.aggregate.codes[404] ? -1 : 0);'
  [[ $? -eq 0 ]]
}

@test "Script using a plugin" {
  ARTILLERY_WORKERS=3 ARTILLERY_PLUGIN_PATH="`pwd`/test/plugins/" ./bin/artillery run -o report.json ./test/scripts/hello_plugin.json
  requestCount1=$(awk '{ sum += $1 } END { print sum }' plugin-data.csv)
  requestCount2=$(jq .aggregate.requestsCompleted report.json)
  rm plugin-data.csv
  rm report.json

  [[ $requestCount1 -eq $requestCount2 ]]
}

@test "The --overrides option may be used to change the script" {
    ./bin/artillery run -e dev --overrides '{"config": {"environments": {"dev":{"target":"http://localhost:3003"}}, "phases": [{"arrivalCount": 1, "duration": 1}]}}' -o report.json test/scripts/environments.yaml

    count=$(jq ".aggregate.scenariosCreated" report.json)

    echo $count

    rm report.json

    [[ $count = "1" ]]
}

@test "The value provided with --overrides must be valid JSON" {
    set +e
    ./bin/artillery run -e local --overrides '{config: {}}' test/scripts/environments.yaml
    status=$?
    set -e

    [[ $status -eq 1 ]]
}
