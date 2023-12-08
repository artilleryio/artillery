#!/usr/bin/env bash

install_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY}" ]; then
        echo "DD_API_KEY is not set. Aborting."
        return 0
    fi

    export DD_HOSTNAME=task-$1
    echo "DD_HOSTNAME set to $DD_HOSTNAME."

    # Download and install the Datadog Agent
    DD_AGENT_MAJOR_VERSION=7 DD_SITE="datadoghq.com" DD_API_KEY=$DD_API_KEY bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"

    # Specify the YAML file to modify
    yaml_file="$HOME/.datadog-agent/datadog.yaml"

    # Configuration to add
    config_to_add='otlp_config:\n  receiver:\n    protocols:\n      http:\n        endpoint: localhost:4318\n'

    # Append the configuration to the file
    printf "%s\n" "$config_to_add" >> "$yaml_file"

    echo "Configuration added to $yaml_file."
    # service datadog-agent restart

    # echo "Restarted datadog-agent."
}

# You can now call this function in your script
# install_and_configure_dd_agent
