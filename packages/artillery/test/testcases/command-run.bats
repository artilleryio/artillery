#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "Run a simple script" {
  ./bin/run run --config ./test/scripts/hello_config.json ./test/scripts/hello.json | grep -i 'summary report'
  [ $? -eq 0 ]
}

@test "Running with no target and no -e should exit with an error" {
  ./bin/run run test/scripts/environments.yaml | grep "No target"
  [ $? -eq 0 ]
}

@test "Telemetry notice is printed" {
  ./bin/run | grep -i 'telemetry is on'
  [ $? -eq 0 ]
}

@test "If telemetry is disabled, no notice is printed" {
  set +e
  ARTILLERY_DISABLE_TELEMETRY ./bin/run | grep -i 'telemetry is on'
  status=$?
  set -e

  [ $status -eq 1 ]
}

@test "Environment specified with -e should be used" {
  # FIXME: Should not need to use "-k" here, see #59
  STATS="$(mktemp -d)/stats"
  ./bin/run run -k -e production -o "$STATS.json" test/scripts/environments2.json
  # TODO: Use jq
  # Here if the right environment is not picked up, we'll have a bunch of ECONNREFUSED errors in the report
  REPORT="$STATS.json" node -e 'var fs = require("fs");var j = JSON.parse(fs.readFileSync(process.env.REPORT));if(typeof j.aggregate.counters["errors.ECONNREFUSED"] !== "undefined") process.exit(1)'
  [ $? -eq 0 ]
}

@test "Run a script with one payload command line" {
  ./bin/run run ./test/scripts/single_payload.json -p ./test/scripts/pets.csv | grep -i 'summary report'
  [ $? -eq 0 ]
}

@test "Run a script with one payload json config" {
  ./bin/run run ./test/scripts/single_payload_object.json| grep -i 'summary report'
  [ $? -eq 0 ]
}

@test "Run a script with one payload json config with parse options passed" {
  ./bin/run run ./test/scripts/single_payload_options.json | grep -i 'summary report'
  [ $? -eq 0 ]
}

@test "Run a script with multiple payloads and use of $environment in path" {
  ./bin/run run -e local ./test/scripts/multiple_payloads.json | grep -i 'summary report'
  [ $? -eq 0 ]
}

@test "Run a script overwriting default options (output)" {
  ./bin/run run --config ./test/scripts/hello_config.json ./test/scripts/hello.json -o artillery_report_custom.json | grep 'Log file: artillery_report_custom.json'
  [ $? -eq 0 ]
}

@test "Script using hook functions" {
  ./bin/run run --config ./test/scripts/hello_config.json ./test/scripts/hello.json | grep 'hello from processor'
  [[ $? -eq 0 ]]
}

@test "Hook functions - can rewrite the URL" {
  # Ref: https://github.com/shoreditch-ops/artillery/issues/185
  ./bin/run run --config ./test/scripts/hello_config.json ./test/scripts/hello.json -o report.json
  node -e 'var fs = require("fs"); var j = JSON.parse(fs.readFileSync("report.json", "utf8"));process.exit(j.aggregate.counters["http.codes.404"] ? -1 : 0);'
  [[ $? -eq 0 ]]
}

@test "Environment variables can be loaded from dotenv files" {
  ./bin/run run --dotenv ./test/scripts/with-dotenv/my-vars ./test/scripts/with-dotenv/with-dotenv.yml -o report-with-dotenv.json
  node -e 'var fs = require("fs"); var j = JSON.parse(fs.readFileSync("report-with-dotenv.json", "utf8"));process.exit(j.aggregate.counters["http.codes.200"] === 1 ? 0 : 1);'
  [[ $? -eq 0 ]]
}

@test "Script using a plugin" {
  ARTILLERY_USE_LEGACY_REPORT_FORMAT=1 ARTILLERY_WORKERS=3 ARTILLERY_PLUGIN_PATH="`pwd`/test/plugins/" ./bin/run run -o report.json ./test/scripts/hello_plugin.json
  requestCount1=$(awk '{ sum += $1 } END { print sum }' plugin-data.csv)
  requestCount2=$(jq .aggregate.requestsCompleted report.json)
  rm plugin-data.csv
  rm report.json

  [[ $requestCount1 -eq $requestCount2 ]]
}

@test "The --overrides option may be used to change the script" {
    ARTILLERY_USE_LEGACY_REPORT_FORMAT=1 ./bin/run run -e dev --overrides '{"config": {"environments": {"dev":{"target":"http://localhost:3003"}}, "phases": [{"arrivalCount": 1, "duration": 1}]}}' -o report.json test/scripts/environments.yaml

    count=$(jq ".aggregate.scenariosCreated" report.json)

    echo $count

    rm report.json

    [[ $count = "1" ]]
}

@test "The value provided with --overrides must be valid JSON" {
    set +e
    ./bin/run run -e local --overrides '{config: {}}' test/scripts/environments.yaml
    status=$?
    set -e

    [[ $status -eq 1 ]]
}

@test "Ramp to script throughput behaves as expected running on multiple workers" {
    # This would cause older versions of artillery to generate much more traffic than expected
    # We compare them to the max amount of arrivals we expect from the script
    # Note: v2.0.0-22 generates 20+ arrivals, almost double
    ./bin/run run -o multiple_workers.json test/scripts/ramp.json
    WORKERS=1 ./bin/run run -o single_worker.json test/scripts/ramp.json

    multiple_count=$(jq '.aggregate.counters."vusers.created"' multiple_workers.json)
    single_count=$(jq '.aggregate.counters."vusers.created"' single_worker.json)

    rm multiple_workers.json
    rm single_worker.json

    max_expected=11

    [[ $multiple_count -le $max_expected && $single_count -le $max_expected ]]
}

@test "Ramp to 2.0.0-24 regression #1682" {
    # This would cause older versions of artillery to use Infinity as tick duration
    # causing a worker to break and log:
    # `(node:12259) TimeoutOverflowWarning: Infinity does not fit into a 32-bit signed integer.
    # Timeout duration was set to 1.`
    # This happened because for a certain phase a worker had arrivalRate==rampTo==0
    set +e
    WORKERS=7 ./bin/run run ./test/scripts/ramp-regression-1682.json 2>&1 | grep -q -m1 "TimeoutOverflowWarning"
    [[ $? -eq 1 ]]
    set -e
}

@test "Wildcard is handled properly in socketio" {
    ./bin/run run ./test/scripts/wildcard_socketio.json 2>&1 | grep -q -m1 "Wildcard"
    [[ $? -eq 0 ]]
}
