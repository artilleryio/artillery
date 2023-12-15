
start_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY-}" ]; then
        echo "DD_API_KEY not set. Not running Datadog Agent."
        return 0
    fi

    # Specify the YAML file to modify
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
    yq -i ".otlp_config.receiver.protocols.grpc.endpoint = \"localhost:4317\"" "$yaml_file"

    # Add apm_config trace_buffer
    yq -i ".apm_config.trace_buffer = 100" "$yaml_file"

    # TODO investigate if max_traces_per_second needs adjusting 
    # TODO review other config options. Reference https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml#L1279C1-L1287C30

    echo "Starting datadog-agent..."
    service datadog-agent start

    echo "Started datadog-agent successfully!"
}