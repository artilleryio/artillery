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
          capture:
            - json: "$.name"
              as: name
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: results
            - equals:
              - "Tiki"
              - "{{ name }}"
```

## Expectations

### `statusCode`

Check that the response status code equals the code given.

```
expect:
  - statusCode: 201
```

### `contentType`

Check the value of [`Content-Type`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type) header.

### `hasProperty`

When the response is JSON, check that the response object has a property. Same as [`lodash#has`](https://lodash.com/docs/#has).

```
expect:
  - hasProperty: 'data[0].id'
```

### `equals`

Check that two or more values are the same. **NOTE** only primitive values (e.g. booleans, strings and numbers) are currently supported.

```
- get:
    url: "/pets/f037ed9a"
    capture:
      - json: "$.species"
        as: species
    expect:
      - equals:
          - "{{ species }}"
          - "dog"
```

## License

MPL 2.0
