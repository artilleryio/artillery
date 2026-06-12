# artillery-plugin-fake-data

## Easy randomised test data leveraging Faker

With this plugin, you can add random test data using [Faker](https://fakerjs.dev/api/) straight into YAML, giving you a wide range of test data options to choose from. You'll also be able to use the same functions in your `beforeRequest`/`afterResponse` hooks. Check the documentation for more information.

Faker functions are exposed with flattened names: `faker.internet.email()` becomes `$internetEmail()`, `faker.person.fullName()` becomes `$personFullName()`, and so on.

### Migrating from falso

Earlier versions of this plugin used [falso](https://ngneat.github.io/falso/). The most commonly used falso-style names (e.g. `$randEmail`, `$randFullName`, `$randPassword`) still work as deprecated aliases, but will be removed in a future release. Function configuration options now use Faker's option shapes (e.g. `internetPassword: { length: 5 }` instead of `randPassword: { size: 5 }`). See the [plugin documentation](https://www.artillery.io/docs/reference/extensions/fake-data) for a migration table.

## Documentation

📖 [Plugin documentation](https://www.artillery.io/docs/reference/extensions/fake-data)

## Feedback, Bugs, Issues
`EXPERIMENTAL`: This plugin is experimental and under active development. Please create an issue if you find something not working or want to propose a change:

🐞 Please report bugs over at [https://github.com/artilleryio/artillery/issues](https://github.com/artilleryio/artillery/issues)
💬 Ask for help or propose a new features via [Github Discussions](https://github.com/artilleryio/artillery/discussions)
🐦 Follow [@artilleryio](https://twitter.com/intent/follow?original_referer=https%3A%2F%2Fartillery.io%2F&ref_src=twsrc%5Etfw&region=follow_link&screen_name=artilleryio&tw_p=followbutton) on Twitter for updates

## License

MPL 2.0
