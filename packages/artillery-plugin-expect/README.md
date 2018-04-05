# artillery-plugin-expect

## Functional API testing with Artillery

Add expectations to your HTTP scenarios for functional API testing with Artillery.

## Usage

### Install the plugin

```
npm install -g artillery-plugin-expect
```

### Enable the plugin in the config section

```yaml
config:
  target: "http://example.com"
  plugins:
    expect: {}
```

### Use expectations on your requests

```yaml
scenarios:
  - name: Get pets
    flow:
      - get:
          url: "/pets"
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: results
```

## License

MPL 2.0
