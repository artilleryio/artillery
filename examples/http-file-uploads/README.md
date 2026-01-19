# HTTP file uploads

This example shows you how to perform HTTP file uploads from an Artillery test script.

## Running the HTTP server

This example includes an Express.js application running an HTTP server.

First, install the server dependencies:

```shell
npm install
```

After installing the dependencies, start the HTTP server:

```shell
npm run app:start
```

This command will start an HTTP server listening at http://localhost:3000/.

## Running Artillery tests

This directory contains a test script (`file-uploads.yml`) which demonstrates how you can upload files in your scenarios.

Once the HTTP server is up and running, execute the test script:

```
artillery run file-uploads.yml
```

## Cleaning up uploaded files

During the test run, Artillery will upload files to the HTTP server, which get stored in the `uploads` directory. For convenience, you can clean the directory by executing the following command:

```
npm run uploads:clean
```
