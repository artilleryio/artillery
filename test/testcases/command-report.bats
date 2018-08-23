#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "If we report specifying output, no browser is opened" {
  HTML_OUT="$(mktemp -d)/report.html"
  ./bin/artillery report -o $HTML_OUT test/scripts/report.json | grep "Report generated: $HTML_OUT"
  [ $? -eq 0 ]
  [ -f $HTML_OUT ]
}

@test "If we report without specifying if we want the 'Raw Report Data' section, it is emitted by default in the output HTML" {
  HTML_OUT="$(mktemp -d)/report.html"
  ./bin/artillery report -o $HTML_OUT test/scripts/report.json
  grep 'Raw report data' $HTML_OUT
}

@test "If we report specifying to exclude the 'Raw Report Data' section, it is not emitted in the output HTML" {
  HTML_OUT="$(mktemp -d)/report.html"
  ./bin/artillery report -e -o $HTML_OUT test/scripts/report.json
  
  run 'Raw report data' $HTML_OUT
  [ "$status" -ne 0 ]
}