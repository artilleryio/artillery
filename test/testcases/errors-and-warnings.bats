#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "Running a script that uses XPath capture when libxmljs is not installed produces a warning" {
    if [[ ! -z `find . -name "artillery-xml-capture" -type d` ]]; then
      find . -name "artillery-xml-capture" -type d | xargs rm -r
    fi
    ./bin/artillery run --config ./test/scripts/hello_config.json ./test/scripts/hello_with_xpath.json  | grep 'artillery-xml-capture'
    grep_status=$?
    npm install artillery-xml-capture || true
    [ $grep_status -eq 0 ]
}

@test "Clean up when killed" {
  MULTICORE=1 ARTILLERY_WORKERS=4 ./bin/artillery quick -d 120 -r 1 http://localhost:3003/ &
  artillery_pid=$!
  sleep 5
  kill $artillery_pid
  sleep 4
  [[ -z $(pgrep -lfa node | grep worker.js) ]]
}

# Ref: https://github.com/shoreditch-ops/artillery/issues/215
@test "GH #215 regression" {
  ./bin/artillery run test/scripts/gh_215_add_token.json
  [[ true ]]
}

@test "Warns when CPU usage exceeds a threshold" {
    CPU_HOT_BEFORE_WARN=5 ARTILLERY_CPU_THRESHOLD=-1 ./bin/artillery quick -d 10 -c 10 http://localhost:3003/ | grep 'CPU usage'
    [[ $? -eq 0  ]]
}

@test "Prints an error message when an unknown command is used" {
    run './bin/artillery makemeasandwich --with cheese'
    [[ $status -gt 0 ]]
}
