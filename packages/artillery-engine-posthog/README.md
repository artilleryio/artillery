# Artillery.io PostHog Plugin

<p align="center">
    <em>Load test Posthog with <a href="https://artillery.io">Artillery.io</a></em>
</p>

## Why?

Load testing PostHog stream will help you answer question like _"is our self-hosted posthog instance able to handle expected volume?"_

Take guesswork out of provisioning capacity and make sure you are ready to scale.

## Usage

### Install the plugin

```
# If Artillery is installed globally:
npm install -g artillery-engine-posthog
```

### Use the plugin

1. in `config.posthog`:
    - `api_key` - Your PostHog project api key
    - `instance_address` - **optional**: You can omit this if using PostHog Cloud
2. Set the `engine` property of the scenario to `posthog`.
3. In your scenario, use: 
    - `capture` to send events to PostHog
    - `identify` and `alias` to enrich users metadata

#### Example Script

```yaml
config:
  target: "posthog-test"
  posthog:
    api_key: "{{ $processEnvironment.POSTHOG_API_KEY }}"
    # uses PostHog Cloud as default but an instance address can be provided:
    # instance_address: ".." 
  phases:
    - arrivalCount: 5
      duration: 10
  engines:
    posthog: {}
scenarios:
  - name: "posthog engine test"
    engine: posthog
    flow:
      - count: 3
        loop:
        - capture:
            distinctId: "distinct id"
            event: "movie played"
            properties:
              movieId: "Die Hard"
              category: "Christmas"
        - think: 2
```

(See [examples folder](examples/) for a couple of full examples.)

### Run Your Script

```
POSTHOG_API_KEY=xxx artillery run example.yml
```

### License

[MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
