
<img width="1012" alt="Modern testing for DevOps and SRE" src="https://user-images.githubusercontent.com/1490/145614295-12af8edc-4e17-4c76-af16-fa31faa12e54.png">



<h3 align="center">
  keep <code>production</code> fast & reliable, customers happy, and pagers silent
</h3>

<p align="center">
  <a href="https://www.artillery.io/docs">Docs</a> | <a href="https://github.com/artilleryio/artillery/discussions">Discussions</a> | <a href="https://twitter.com/artilleryio">@artilleryio</a>
</p>

<p align="center">
  <img alt="npm" src="https://img.shields.io/npm/dm/artillery?style=flat-square">
</p>

<p align="center">
  Enjoying using Artillery? Give us a star for good karma 🌟
  (We <a href="#artillery-forest">plant a tree</a> for every Github star we get)
</p>

<p align="center">
  Join us, <a href="https://www.artillery.io/blog/artillery-hiring-product-engineers">we're hiring</a>.
</p>

----

# Use Cases

- Prepare for traffic spikes - run load tests to help prepare your API or service for upcoming peak traffic
- Run load tests to help ensure that SLOs are met under load as code and infrastructure config change
- Run continuous smoke tests to catch issues before they reach production
- Run Artillery in CI/CD to prevent performance regressions
- Profile and debug performance issues such as memory leaks, high tail latency caused by GC pauses or high CPU usage, or misconfigured resource pools
- Scale out and run distributed load tests from your own AWS account

# Features

- **Test ANY stack**:  Load test HTTP, WebSocket, Socket.io, Kinesis, HLS, and more
- **Scenarios**: Support for complex *scenarios* to test multi-step interactions in your API or web app (great for ecommerce, transactional APIs, game servers etc).
- **Load testing & smoke testing**: reuse the same scenario definitions to run performance tests or functional tests on your API or backend.
- **Detailed performance metrics**: get detailed performance metrics (response time, TTFB, transactions per second, concurrency, throughput). Track [**custom metrics**](https://artillery.io/docs/guides/guides/extending.html#Tracking-custom-metrics) with high precision (histograms, counters and rates)
- **Scriptable**: write custom logic in JS, using any of the thousands of useful `npm` modules.
- **Batteries-included**: out-of-the-box integrations with external monitoring systems such as Datadog, InfluxDB, Honeygcomb, and Lightstep, [per-URL metrics](https://artillery.io/docs/guides/plugins/plugin-metrics-by-endpoint.html), file uploads, SSL auth, [fuzz testing](https://artillery.io/docs/guides/plugins/plugin-fuzzer.html), and [more](https://www.artillery.io/integrations)!
- **Extensible**: write custom reporters, custom plugins, and custom engines, or customize VU scenarios and behavior
- **Cloud-native**: built for the cloud from day one - run [distributed load tests](https://artillery.io/pro/) from your own AWS account with ease
- **and more!** HTML reports, nice CLI, parameterization with CSV files, CICD integrations

---

- **Docs**: [https://artillery.io/docs/](https://artillery.io/docs/)
- **Q&A and discussions**: [https://github.com/artilleryio/artillery/discussions](https://github.com/artilleryio/artillery/discussions)
- **Website**: [https://artillery.io](https://artillery.io)
- **Twitter**: [@artilleryio](https://twitter.com/artilleryio)
- **Source**: [https://github.com/artilleryio/artillery](https://github.com/artilleryio/artillery) - `master` build status: [![CircleCI](https://circleci.com/gh/artilleryio/artillery.svg?style=svg)](https://circleci.com/gh/artilleryio/artillery)
- **Issues**: [https://github.com/artilleryio/artillery/issues](https://github.com/artilleryio/artillery/issues)

---

# Getting Started With Artillery

👉&nbsp;&nbsp;[Artillery Getting Started Guide](https://artillery.io/docs/guides/getting-started/installing-artillery.html)

# Using Artillery?

Add your team to the [Artillery users list on the wiki](https://github.com/shoreditch-ops/artillery/wiki/Companies-using-Artillery).

# Artillery Forest

We have planted [a lot of trees](https://ecologi.com/artilleryio) with the help of Artillery community.

Want to help us grow the forest?

- Just star this repo! We plant a tree for every star we get on Github. 🌟 ➡️ 🌳
- Plant some extra trees through Ecologi → https://ecologi.com/artilleryio (use your name or the name of your company for credit)


# License

**Artillery** is open-source software distributed under the terms of the [MPLv2](https://www.mozilla.org/en-US/MPL/2.0/) license.
