# Using Data from Redis

Due to Artillery's concurrent nature, there is no way to guarantee that test data used (e.g. using CSV) is uniquely accessed by your virtual users, especially running distributed load tests.

In some cases, you may require users to be unique. In those cases, using Redis is a simple alternative. You can use your own Redis (e.g. AWS Elasticache), or use a managed solution like Upstash. We recommend Upstash due to its simplicity and serverless nature.

This example will show you how to connect an Artillery test to an Upstash Redis instance, and pull a unique user each time.

## Pre-requisites

- Create an Upstash account
- Follow the simple guide to create an [Upstash Redis instance](https://upstash.com/docs/redis/overall/getstarted)
- Obtain the `endpoint` and `token` from the UI

## How it works

We'll first seed a Redis database with auto-generated users. Using a [`beforeScenario`](https://www.artillery.io/docs/reference/engines/http#function-actions-and-beforescenario--afterscenario-hooks) hook we pull a unique user per VU from Redis (`using Redis lpop`), and save its username and password in `context.vars`. 

The scenario is then simply logging the username and password to the console to demonstrate that they are unique.

## Running the example

- First, create a `.env` file in this directory, with the same contents as `.env.sample`, filling in the information with your endpoint and token.
- Run `npm install` in this directory to install the needed dependencies
- Run `npm run seed` to seed the Redis instance with 100 auto-generated users (username and password)

You can now run your Artillery test with `npm run test`. You'll see the users printed to the console.

## Additional thoughts

- We seed the database in a separate script. However, you could easily run the seeding step as part of a [`before`](https://www.artillery.io/docs/reference/test-script#before-and-after-sections) hook if desired
- If you're interested in the additional overhead of pulling the user from Redis, you can run the test with the `SHOW_TIMING=true` variable. Redis is very fast, and typically each call should only add <30 ms to each VU execution (depending on factors like instance sizes, size of the load test, network, etc)