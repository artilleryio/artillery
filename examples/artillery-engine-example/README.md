# Artillery.io example Engine

Simple example engine that prints config and scenario props using `debug`.
The idea is to provide a peek into artillery engines with a hands-on approach.

## Usage

- Install deps: `npm install`
- Set up parent folder as `NODE_PATH` so this engine is loaded by artillery: `export NODE_PATH=$(pwd)/..`
- Run with DEBUG on for our engine: `DEBUG=engine:example artillery run example.yaml`

You should see debug prints on both `customSetup` and `customHandler` regarding setup and script props
```
...
2023-01-01T15:31:18.087Z engine:example executing setup logic
2023-01-01T15:31:18.090Z engine:example { id: 'distinct id' }
2023-01-01T15:31:18.090Z engine:example script prop: script wide prop loaded at startup
2023-01-01T15:31:18.090Z engine:example scenario prop: distinct id
...
```
### License

[MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
