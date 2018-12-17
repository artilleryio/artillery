#!/usr/bin/env bats

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

@test "Running with no arguments prints out usage information" {
  ./bin/artillery | grep Usage
  [[ $? -eq 0 ]]
}

@test "artillery -V prints the right version number" {
  ./bin/artillery -V | grep -i 'version info'
  [[ $? -eq 0 ]]
}

@test "Can run a quick HTTP test with 'artillery quick'" {
  ./bin/artillery quick -d 1 -r 1 https://artillery.io | \
                  grep 'All virtual users finished'
  [[ $? -eq 0 ]]
}
