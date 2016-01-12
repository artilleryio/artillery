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

@test "Can run a quick HTTP test with 'minigun quick'" {
  ./bin/minigun quick -d 10 -r 1 -o `mktemp` http://minigun.io | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a simple script" {
  ./bin/minigun run ./test/scripts/hello.json | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a script with one payload" {
  ./bin/minigun run ./test/scripts/single_payload.json -p ./test/scripts/pets.csv | grep 'all scenarios completed'
  [ $? -eq 0 ]
}

@test "Run a script with multiple payloads" {
  ./bin/minigun run ./test/scripts/multiple_payloads.json | grep 'all scenarios completed'
  [ $? -eq 0 ]
}
