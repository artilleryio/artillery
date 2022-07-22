# Table-driven functional tests with Artillery

This example shows how you can drive functional testing with Artillery with a simple CSV file.

We define a CSV file which contains URLs + a status code expectation for each URL:

```csv
/,200
/docs,302
/dinosaur,404
```

An Artillery script uses the data in the CSV file to make a request to each URL and check the assertions.

This makes it easy to add new test cases without having to modify the Artillery script itself.

## Run the example

To run the example:

```sh
# install dependencies:
npm install
# run the Artillery test:
npm run functional-test
```

You can also run the Artillery test with:

```sh
$(npm bin)/artillery run --solo -q functional-test.yml
```

⚠️ **NOTE**: this example depends on the most recent preview releases of Artillery and `expect` plugin.