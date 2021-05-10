<p align="center">
<a href="https://artillery.io"><img src="https://artillery.io/images/artillery-logo-square.png" height="120" /></a>
</p>

<h2 align="center">
  keep <code>production</code> fast & reliable,<br />
  customers happy,</br>
  and pagers silent
</h2>

<br/>

<p align="center">
  Artillery is a <strong>load testing</strong> and <strong>smoke testing</strong> tool for developers, testers, and SREs.<br><br>
  Use Artillery to ship scalable APIs &amp; services that stay fast & reliable under high load.<br><br>
  Artillery has a strong focus on developer happiness & ease of use, and a batteries-included philosophy.
</p>

<p align="center">
  Got a question? Want to share how you use Artillery? ➡️  <a href="https://github.com/artilleryio/artillery/discussions">Artillery Discussion Board</a>
  <br/>
  Or come chat on Discord - <a href="https://discord.gg/37vGhH3NMB">https://discord.gg/37vGhH3NMB</a> 💬
</p>


# Use Cases

- Prepare for traffic surges - run load tests to help prepare your API or service for upcoming peak traffic
- Run load tests in CI/CD to catch and prevent performance regressions before they cause issues for users
- Profile and debug performance issues such as memory leaks, high tail latency caused by GC pauses or high CPU usage, or misconfigured resource pools
- Run smoke tests continuously against production to catch issues (also known as production scripted testing or synthetic monitoring)
- Designed for modern web APIs, headless CMS and e-commerce systems, IoT backends, real-time services, and microservice architectures
- Test internal microservices and components as well as external endpoints
- Scale out and run your tests from your own AWS account with ease

# Features

- **Test ANY stack**:  Load test HTTP, WebSocket, Socket.io, Kinesis, HLS, and more
- **Scenarios**: Support for complex *scenarios* to test multi-step interactions in your API or web app (great for ecommerce, transactional APIs, game servers etc).
- **Load testing & smoke testing**: reuse the same scenario definitions to run performance tests or functional tests on your API or backend.
- **Performance metrics**: get detailed performance metrics (latency, requests per second, concurrency, throughput). Track custom metrics with high precision (histograms, counters and rates)
- **Scriptable**: write custom logic in JS, using any of the thousands of useful `npm` modules.
- **Integrations**: `statsd` support out of the box for real-time reporting (integrate with [Datadog](http://docs.datadoghq.com/guides/dogstatsd/), [Librato](https://www.librato.com/docs/kb/collect/collection_agents/stastd.html), [InfluxDB](https://influxdata.com/blog/getting-started-with-sending-statsd-metrics-to-telegraf-influxdb/) etc).
- **Extensible**: write custom reporters, custom plugins, and custom engines, or just customize VU behavior
- **Cloud-native**: go from running a test locally to running it in your own AWS account, distributed across geographical regions in minutes with [Artillery Pro](https://artillery.io/pro)
- **and more!** HTML reports, nice CLI, parameterization with CSV files.

---

- **Docs**: [https://artillery.io/docs/](https://artillery.io/docs/)
- **Q&A and discussions**: [https://github.com/artilleryio/artillery/discussions](https://github.com/artilleryio/artillery/discussions)
- **Website**: [https://artillery.io](https://artillery.io)
- **Twitter**: [@artilleryio](https://twitter.com/artilleryio)
- **Source**: [https://github.com/artilleryio/artillery](https://github.com/artilleryio/artillery) - `master` build status: [![CircleCI](https://circleci.com/gh/artilleryio/artillery.svg?style=svg)](https://circleci.com/gh/artilleryio/artillery)
- **Issues**: [https://github.com/artilleryio/artillery/issues](https://github.com/artilleryio/artillery/issues)

---

- **[Artillery Pro](https://artillery.io/pro/)**: if you want to **scale out** your tests and run them from hundreds of nodes, multiple geographic regions, and **your own AWS account** you're going to love [Artillery Pro](https://artillery.io/pro/). Get going in minutes (for real), and avoid reinventing the wheel or building a DIY in-house solution for load testing. Self-hosted and self-service, with support for Fargate and ECS, and ability to plug into existing AWS security, compliance and governance controls in your organization. [Drop us a line](mailto:sales@artillery.io?subject=Artillery%20Pro%20Sounds%20Interesting) if that sounds interesting.
- For **training**, **custom integrations**, and **performance consulting services** see our [professional services page](https://artillery.io/services/).

# Getting Started With Artillery

👉&nbsp;&nbsp;[Artillery Getting Started Guide](https://artillery.io/docs/guides/getting-started/installing-artillery.html)

# Using Artillery?

Add your team to the [Artillery users list on the wiki](https://github.com/shoreditch-ops/artillery/wiki/Companies-using-Artillery).

# Plant Some Trees!

We have planted [over 1,900 new trees](https://ecologi.com/artilleryio) with the help of Artillery community. That's a small forest! We're aiming to grow that to a *large* forest - we're thinking 100,000 trees would be neat.

If you've enjoyed using Artillery and would like to help us out, add your tree to the [Artillery.io forest](https://ecologi.com/artilleryio). 🌲🌳🌴 Feel free to drop us a line to let us know too! 💚

# License

**Artillery** is open-source software distributed under the terms of the [MPLv2](https://www.mozilla.org/en-US/MPL/2.0/) license.
