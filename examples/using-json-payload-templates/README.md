# Using JSON payloads with optional templating

This examples shows a solution for testing an HTTP API using JSON payloads which are loaded from external JSON files, with optional templating of values inside those JSON files.

It works as follows:

- A custom helper function is used to load the JSON payload from a file and template it. Different request can load and template different JSON payloads.
- Built in `fake-data` plugin and CSV payloads to provide template variables

The test uses https://practicesoftwaretesting.com by https://www.testsmith.io.