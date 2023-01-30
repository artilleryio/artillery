# Artillery Engine for PostHog

![PostHog logo](https://posthog.com/brand/posthog-logo.svg)

[PostHog](https://posthog.com) is an open-source product analytics platform.

This Artillery engine is designed for users of self-hosted PostHog (Open-Source or [PostHog Enterprise](https://posthog.com/docs/self-host)). It makes it easy to load test your PostHog deployment to:

- Make sure the deployment can handle the event volume you're expecting
- Make sure the deployment can handle bursts in event volumes
- Take guesswork out of provisioning capacity and make sure that both PostHog and its dependencies (e.g. [ClickHouse](https://clickhouse.com/)) are ready to scale

## Usage

### Install the plugin

```sh
npm install -g artillery-engine-posthog
```

### Configuration

1. Set the address of your PostHog instance with `config.target`, and set a PostHog API key with `config.posthog.apiKey`.
2. Set the `engine` property of the scenario to `posthog`.
3. In your scenario, use:
    - `capture` to send events to PostHog
    - `identify` and `alias` to enrich users metadata

#### Example Script

```yaml
config:
  target: "https://posthog.acme.corp"
  posthog:
    apiKey: "{{ $processEnvironment.POSTHOG_API_KEY }}"
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

## License

[MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
