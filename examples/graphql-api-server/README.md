# Load testing an GraphQL service with Artillery

This example shows you how to run load tests on a GraphQL API using Artillery.

## Running the GraphQL server

This example runs a GraphQL server using [Apollo Server](https://www.apollographql.com/docs/apollo-server/) and [Prisma](https://www.prisma.io/) with a SQLite 3 database for data persistence.

First, install the server dependencies:

```shell
npm install
```

Next, create the SQLite database and set up the required database tables by running the initial Prisma database migration:

```shell
npx prisma migrate dev
```

After installing the dependencies and setting up the database, start the GraphQL server:

```shell
node app.js
```

This command will start the GraphQL API server listening at http://localhost:4000/. Once the server is up and running, you can explore the server using the [Apollo Sandbox](https://studio.apollographql.com/sandbox/).

## Running Artillery test

This directory contains a test script (`graphql.yml`) which demonstrates how to use Artillery scenarios against a GraphQL server. The test script contains a scenario executing various queries and mutations on the GraphQL server.

Once the GraphQL server is up and running, execute the test script:

```
artillery run graphql.yml
```
