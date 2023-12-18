
start_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY-}" ]; then
        echo "DD_API_KEY not set. Not running Datadog Agent."
        return 0
    fi

    service --status-all

    export DD_API_KEY="$DD_API_KEY"
    export DD_HOSTNAME="task-$1"
    export DD_OTLP_CONFIG_TRACES_ENABLED=true
    export DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=0.0.0.0:4318
    export DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GCPR_ENDPOINT=0.0.0.0:4317
    export DD_APM_ENABLED=true
    export DD_APM_RECEIVER_PORT=8126
    export DD_APM_TRACE_BUFFER=100
    export DD_SITE=datadoghq.com

    # Specify the YAML file to modify
    yaml_file="/etc/datadog-agent/datadog.yaml"
    hostname="task-$1"

    # Reference of configuration to add
    # https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml

    # Update API Key in the config file
    # yq -i ".api_key = \"$DD_API_KEY\"" "$yaml_file"

    # # Add/Update hostname
    # yq -i ".hostname = \"$hostname\"" "$yaml_file"

    # # Add otlp config
    # yq -i ".otlp_config.receiver.protocols.http.endpoint = \"localhost:4318\"" "$yaml_file"
    # yq -i ".otlp_config.receiver.protocols.grpc.endpoint = \"localhost:4317\"" "$yaml_file"

    # # Add apm_config trace_buffer
    # yq -i ".apm_config.trace_buffer = 100" "$yaml_file"

    # TODO investigate if max_traces_per_second needs adjusting 
    # TODO review other config options. Reference https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml#L1279C1-L1287C30

    echo "Starting datadog-agent..."
    service datadog-agent start

    echo "Started datadog-agent successfully!"
}