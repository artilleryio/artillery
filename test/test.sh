#!/usr/bin/env bats

function artillery() {
  if [ -n "ISTANBUL" ]
  then
    istanbul cover ./bin/artillery "$@"
  else
    ./bin/artillery "$@"
  fi
}

@test "If we report specifying output, no browser is opened" {
  HTML_OUT=`mktemp`
  ./bin/artillery report -o $HTML_OUT test/scripts/report.json | grep "Report generated: $HTML_OUT"
  [ $? -eq 0 ]
  [ -f $HTML_OUT ]
}

@test "Running with no arguments prints out usage information" {
  ./bin/artillery | grep Usage
  [ $? -eq 0 ]
}

@test "artillery -V prints the right version number" {
  version1=$(./bin/artillery -V)
  version2=$(grep version package.json | tr -d '"version:, ''"')
  [[ $version1 = $version2 ]]
}

@test "Running with no target and no -e should exit with an error" {
  ./bin/artillery run test/scripts/environments.json | grep "No target"
  [ $? -eq 0 ]
}

@test "Environment specified with -e should be used" {
  # FIXME: Should not need to use "-k" here, see #59
  STATS=`mktemp`
  ./bin/artillery run -k -e production -o "$STATS" test/scripts/environments2.json
  # TODO: Use jq
  # Here if the right environment is not picked up, we'll have a bunch of ECONNREFUSED errors in the report
  REPORT="$STATS.json" node -e 'var fs = require("fs");var j = JSON.parse(fs.readFileSync(process.env.REPORT));if(Object.keys(j.aggregate.errors).length !== 0) process.exit(1)'
  [ $? -eq 0 ]
}

@test "Can run a quick HTTP test with 'artillery quick'" {
  ./bin/artillery quick -d 10 -r 1 -o `mktemp` https://artillery.io | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Can specify output filename for artillery quick" {
  JSON_REPORT=`mktemp`
  ./bin/artillery quick -d 1 -r 1 -o $JSON_REPORT https://artillery.io | grep "Log file: $JSON_REPORT"
  [ $? -eq 0 ]
}

@test "'artilery quick' accepts a variety of options" {
    ./bin/artillery quick --duration 10 --rate 1 https://artillery.io/
    [ $? -eq 0 ]
}

@test "Run a simple script" {
  ./bin/artillery run ./test/scripts/hello.json | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a script with one payload command line" {
  ./bin/artillery run ./test/scripts/single_payload.json -p ./test/scripts/pets.csv | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a script with one payload json config" {
  ./bin/artillery run ./test/scripts/single_payload_object.json| grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a script with multiple payloads" {
  ./bin/artillery run ./test/scripts/multiple_payloads.json | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a script using default options (output)" {
  ./bin/artillery run ./test/scripts/hello.json | grep "Log file: artillery_report_*"
  [ $? -eq 0 ]
}

@test "Run a script overwriting default options (output)" {
  ./bin/artillery run ./test/scripts/hello.json -o artillery_report_custom | grep 'Log file: artillery_report_custom.json'
  [ $? -eq 0 ]
}

@test "Running a script that uses XPath capture when libxmljs is not installed produces a warning" {
    find . -name "artillery-xml-capture" -type d | xargs rm -r
    ./bin/artillery run ./test/scripts/hello_with_xpath.json  | grep 'artillery-xml-capture'
    grep_status=$?
    npm install artillery-xml-capture
    [ $grep_status -eq 0 ]
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
    ./bin/artillery quick -c 200 -n 5 -o report.json http://localhost:3003/
    requestCount=$(jq .aggregate.requestsCompleted report.json)
    rm report.json

    [[ $requestCount -eq 1000 ]]
}
