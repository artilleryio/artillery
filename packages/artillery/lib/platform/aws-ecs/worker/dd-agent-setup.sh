#!/usr/bin/env bash

# install_and_configure_dd_agent() {

#     #TODO probably rename this
#     export DD_HOSTNAME=task-$1
#     # export DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=DD_HOSTNAME:4318
#     echo "DD_HOSTNAME set to $DD_HOSTNAME."
#     #TODO get rid of container name
#     echo "CONTAINER NAME IS $2"

#     # Download and install the Datadog Agent
#     # Script 7 downloads the agent version 7 (currently latest)
#     ## TODO Maybe DD_SITE also needs to be overriden
#     DD_INSTALL_ONLY=true DD_SITE="datadoghq.com" DD_API_KEY=$DD_API_KEY bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"
# }

start_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY}" ]; then
        return 0
    fi
        # Specify the YAML file to modify
    yaml_file="/etc/datadog-agent/datadog.yaml"
    hostname="task-$1"

    # Configuration to add
    # https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml
    # and ...
#     config_to_add=$(cat <<EOF

# api_key: $DD_API_KEY
# hostname: $hostname
# otlp_config:
#   receiver:
#     protocols:
#       http:
#         endpoint: $2:4318
# apm_config:
#   trace_buffer: 100
# EOF
#     )

    # Append the configuration to the file
    # echo "$config_to_add" >> "$yaml_file"

    # Update API Key in the config file
    yq -i ".api_key = \"$DD_API_KEY\"" "$yaml_file"

    # Add/Update hostname
    yq -i ".hostname = \"$hostname\"" "$yaml_file"

    # Add otlp config
    yq -i ".otlp_config.receiver.protocols.http.endpoint = \"$2:4318\"" "$yaml_file"

    # Add apm_config trace_buffer
    yq -i ".apm_config.trace_buffer = 100" "$yaml_file"

    echo "Configuration added to $yaml_file."
    echo "Starting datadog-agent..."
    #TODO check how verbose starting is in terms of logs
    cat $yaml_file
    service datadog-agent start

    echo "Started datadog-agent."
}

# https://github.com/DataDog/datadog-agent/issues/3940
## TODO: Probably remove this
# wait_for_dd_agent_to_flush() {
#     if [ -z "${DD_API_KEY}" ]; then
#         return 0
#     fi
#     # Wait for the agent to flush its data
#     echo "Waiting for the agent to flush its data..."
#     sleep 35
#     echo "Done waiting."
# }

# You can now call this function in your script
# install_and_configure_dd_agent
