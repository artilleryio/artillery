
start_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY-}" ]; then
        return 0
    fi

    # Specify the YAML file to modify
    # TODO might need to set the path to yaml_file dynamically?
    yaml_file="/etc/datadog-agent/datadog.yaml"
    hostname="task-$1"

    # Reference of configuration to add
    # https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml

    # Update API Key in the config file
    yq -i ".api_key = \"$DD_API_KEY\"" "$yaml_file"

    # Add/Update hostname
    yq -i ".hostname = \"$hostname\"" "$yaml_file"

    # Add otlp config
    yq -i ".otlp_config.receiver.protocols.http.endpoint = \"localhost:4318\"" "$yaml_file"

    # Add apm_config trace_buffer
    yq -i ".apm_config.trace_buffer = 100" "$yaml_file"

    # TODO might need to change max_traces_per_second
    # TODO review other config options. Reference https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml#L1279C1-L1287C30

    echo "Configuration added to $yaml_file."
    echo "Starting datadog-agent..."
    #TODO check how verbose starting is in terms of logs
    service datadog-agent start

    echo "Started datadog-agent."
}