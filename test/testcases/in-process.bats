#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "Running in-process allows script to be passed directly to run command" {
  node ./test/scripts/in-process.js in-process-script-input
  [[ $? -eq 0 ]]
}

@test "Running in-process allows results to be provided via a callback" {
  node ./test/scripts/in-process.js in-process-results-callback
  [[ $? -eq 0 ]]
}

