#!/usr/bin/env bats

function minigun() {
  if [ -n "ISTANBUL" ]
  then
    istanbul cover ./bin/minigun "$@"
  else
    ./bin/minigun "$@"
  fi
}

@test "Running with no arguments prints out usage information" {
  ./bin/minigun | grep Usage
  [ $? -eq 0 ]
}

@test "minigun -V prints the right version number" {
  version1=$(./bin/minigun -V)
  version2=$(grep version package.json | tr -d '"version:, ''"')
  [[ $version1 = $version2 ]]
}

@test "Running with no target and no -e should exit with an error" {
  ./bin/minigun run test/scripts/environments.json | grep "No target"
  [ $? -eq 0 ]
}
