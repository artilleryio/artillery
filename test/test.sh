#!/usr/bin/env bats

@test "Running with no arguments prints out usage information" {
  ./bin/minigun | grep Usage
  [ $? -eq 0 ]
}

@test "minigun -V prints the right version number" {
  version1=$(./bin/minigun -V)
  version2=$(grep version package.json | tr -d '"version:, ''"')
  [[ $version1 = $version2 ]]
}
