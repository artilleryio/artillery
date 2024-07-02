#!/bin/bash

# This is necessary because npm commands can fail intermittently due to network issues
# The script retries an npm command up to 5 times with a 2-second delay between each attempt
run_npm_command() {
  local max_retries=5
  local retry_count=0
  local sleep_time=2
  local command="$@"

  while [ $retry_count -lt $max_retries ]; do
    $command && break

    retry_count=$((retry_count + 1))
    echo "Command attempt $retry_count failed. Retrying in $sleep_time seconds..."
    sleep $sleep_time
  done

  if [ $retry_count -eq $max_retries ]; then
    echo "Command failed after $max_retries attempts."
    exit 1
  else
    echo "Command succeeded."
  fi
}

if [ $# -eq 0 ]; then
  echo "No npm command provided."
  exit 1
else
  command="npm $@"
fi

run_npm_command "$command"