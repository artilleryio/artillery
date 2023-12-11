#!/usr/bin/env bash

install_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY}" ]; then
        return 0
    fi

    export DD_HOSTNAME=task-$1
    # export DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=DD_HOSTNAME:4318
    echo "DD_HOSTNAME set to $DD_HOSTNAME."
    echo "CONTAINER NAME IS $2"

    # Download and install the Datadog Agent
    DD_AGENT_MAJOR_VERSION=7 DD_SITE="datadoghq.com" DD_API_KEY=$DD_API_KEY bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"

    # Specify the YAML file to modify
    yaml_file="/etc/datadog-agent/datadog.yaml"

    # Configuration to add
    config_to_add=$(cat <<EOF
    
otlp_config:
  receiver:
    protocols:
      http:
        endpoint: $2:4318
apm_config:
  trace_buffer: 100
EOF
    )

    # Append the configuration to the file
    echo "$config_to_add" >> "$yaml_file"

    echo "Configuration added to $yaml_file."
    echo "Restarting datadog-agent..."
    service datadog-agent restart

    echo "Restarted datadog-agent."
}

# https://github.com/DataDog/datadog-agent/issues/3940
wait_for_dd_agent_to_flush() {
    if [ -z "${DD_API_KEY}" ]; then
        return 0
    fi
    # Wait for the agent to flush its data
    echo "Waiting for the agent to flush its data..."
    sleep 35
    echo "Done waiting."
}

# You can now call this function in your script
# install_and_configure_dd_agent
