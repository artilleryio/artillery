
start_and_configure_dd_agent() {
    # Check if DD_API_KEY is set in the environment
    if [ -z "${DD_API_KEY-}" ]; then
        echo "DD_API_KEY not set. Not running Datadog Agent."
        return 0
    fi

    # Specify the YAML file to modify
    yaml_file="/etc/datadog-agent/datadog.yaml"
    # hostname="task-$1"
    # export DD_OTLP_CONFIG_TRACES_ENABLED="true"
    # Reference of configuration to add
    # https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml

    # Update API Key in the config file
    # yq -i ".api_key = \"$DD_API_KEY\"" "$yaml_file"

    # Add/Update hostname
    # yq -i ".hostname = \"$hostname\"" "$yaml_file"
    # export DD_HOSTNAME="task-$1"

    # Add otlp config
    # yq -i ".otlp_config.receiver.protocols.http.endpoint = \"localhost:4318\"" "$yaml_file"
    # yq -i ".otlp_config.receiver.protocols.grpc.endpoint = \"localhost:4317\"" "$yaml_file"

    # export DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT="localhost:4318"
    # export DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GRPC_ENDPOINT="localhost:4317"
    # Add apm_config trace_buffer
    # yq -i ".apm_config.trace_buffer = 100" "$yaml_file"
    # export DD_APM_TRACE_BUFFER="100"

    # TODO investigate if max_traces_per_second needs adjusting 
    # TODO review other config options. Reference https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml#L1279C1-L1287C30

    DD_SITE="datadoghq.com" DD_APM_ENABLED="true" DD_OTLP_CONFIG_TRACES_ENABLED="true" DD_HOSTNAME="task-$1" DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT="localhost:4318" DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GRPC_ENDPOINT="localhost:4317" DD_APM_TRACE_BUFFER="100" bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"

    echo "Starting datadog-agent..."
    service datadog-agent start

    cat $yaml_file

    echo "Started datadog-agent successfully!"
}