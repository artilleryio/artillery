# Kubernetes testing with kubectl-artillery

This example uses the [kubectl-artillery](https://github.com/artilleryio/kubectl-artillery) plugin to bootstrap Artillery tests on Kubernetes.

The plugin can scaffold new Artillery test-scripts from running Kubernetes [Services](https://kubernetes.io/docs/concepts/services-networking/service/). For this to work, a Service will need to have access to the underlying [Pod's](https://kubernetes.io/docs/concepts/workloads/pods/) [liveness HTTP probe](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-a-liveness-http-request) check endpoint. 

And, the plugin can also generate a Job that wraps a test-script to run Artillery test workers on Kubernetes. 

## Trying it out

We will be using the [Movie Browser HTTP test server](app.js) to demonstrate how this works. To make this easy we already have a [containerized version](https://github.com/orgs/artilleryio/packages/container/package/movie-browser-test-endpoints) ready to go. 

This is configured to run on Kubernetes as defined in this [YAML manifest](k8s-deploy.yaml).

[KinD](https://kind.sigs.k8s.io/docs/user/quick-start/) is bundled to help you get and running with a Kubernetes cluster as soon as possible. It runs on [Docker](https://docs.docker.com/get-docker/), so be sure to install it if you're going to use a `KinD` cluster.    

### Install the plugin

[Follow the plugin installation instructions](https://github.com/artilleryio/kubectl-artillery#installation) to install the plugin for your target OS.

### Prepare your Kubernetes cluster

Make sure you have a cluster to deploy to.

If you don't, run this shell script to get up and running with a KinD cluster locally on your machine.

```shell
./hack/kind/kind-with-registry.sh
```

### Deploy to Kubernetes

Get the `Movie Browser HTTP test server` running on Kubernetes,

```shell
kubectl apply -f k8s-deploy.yaml
```

Ensure the server is running.

```shell
kubectl get all -l app=movie-browser
# NAME                                 READY   STATUS    RESTARTS   AGE
# pod/movie-browser-75f47f84f4-xcxkv   1/1     Running   2          5m25s

# NAME                            TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# service/movie-browser-service   ClusterIP   10.96.105.65   <none>        80/TCP    5m25s

# NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/movie-browser   1/1     1            1           5m25s

# NAME                                       DESIRED   CURRENT   READY   AGE
# replicaset.apps/movie-browser-75f47f84f4   1         1         1       5m25s
```

### Scaffold a test-script

The `movie-browser-service` Kubernetes Service exposes an underlying Pod configured with an HTTP Liveness Probe.

The `kubectl-artillery` plugin will use this to scaffold an Artillery test-script from the Service.

```shell
kubectl artillery scaffold movie-browser-service
# artillery-scripts/test-script_movie-browser-service.yaml generated
```

This produces this test-script, 

```yaml
config:
  target: http://movie-browser-service:80/
  environments:
    functional:
      phases:
        - duration: 1
          arrivalCount: 1
      plugins:
        expect: {}
scenarios:
  - flow:
      - get:
          url: http://movie-browser-service:80/healthz
          expect:
            - statusCode: 200

```

The health check under test is an endpoint already provided by the `Movie Browser HTTP test server` in the [http.js](http.js) file.

```javascript
app.get('/healthz', (req, res) => {
  if (response.length > 0) {
    res.status(200).send('Ok');
  } else {
    res.status(500).send('Movie data is missing');
  }
});
```

Feel free to update the test-script with any other tests you'd like to run.

### Generate a test

Now that we have a test-script, `artillery-scripts/test-script_movie-browser-service.yaml`, we can generate a Kubernetes [Job](https://kubernetes.io/docs/concepts/workloads/controllers/job/) that mounts the test-script as a [ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) all packaged with [Kustomize](https://kustomize.io).

```shell
kubectl artillery generate movie-browser-service -s artillery-scripts/test-script_movie-browser-service.yaml
# artillery-manifests/test-job.yaml generated
# artillery-manifests/kustomization.yaml generated
```

This produces this Job manifest `artillery-manifests/test-job.yaml`,

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  labels:
    artillery.io/component: test-worker-master
    artillery.io/part-of: artilleryio-test
    artillery.io/test-name: movie-browser-service
  name: movie-browser-service
  namespace: default
...
...
```

And Kustomize manifest,

```yaml
kind: Kustomization
apiVersion: kustomize.config.k8s.io/v1beta1
namespace: default
resources:
  - test-job.yaml
configMapGenerator:
  - name: movie-browser-service-test-script
    files:
      - test-script_movie-browser-service.yaml
generatorOptions:
  labels:
    artillery.io/component: artilleryio-test-config
    artillery.io/part-of: artilleryio-test
  disableNameSuffixHash: true
```

Here we use Kustomize to create a ConfigMap, `movie-browser-service-test-script`, that will mount our test-script into our cluster.

### Run a test

Deploying the generated manifests to our cluster will actually run Artillery test workers on Kubernetes.

```shell
kubectl apply -k artillery-manifests
# configmap/movie-browser-service-test-script created
# job.batch/movie-browser-service created
```

Getting the job, `job.batch/movie-browser-service`, and test worker, `pod/movie-browser-service-9xnsn`, statuses.

```shell
kubectl get all -l artillery.io/part-of=artilleryio-test
# NAME                              READY   STATUS      RESTARTS   AGE
# pod/movie-browser-service-9xnsn   0/1     Completed   0          44s

# NAME                              COMPLETIONS   DURATION   AGE
# job.batch/movie-browser-service   1/1           24s        45s
```

And the test results can be viewed from the test worker's logs,

```shell
kubectl logs pod/movie-browser-service-9xnsn
# Phase started: unnamed (index: 0, duration: 1s) 12:17:50(+0000)

# Phase completed: unnamed (index: 0, duration: 1s) 12:17:51(+0000)

# --------------------------------------
# Metrics for period to: 12:18:00(+0000) (width: 0.12s)
# --------------------------------------

# http.codes.200: ................................................................ 1
# http.request_rate: ............................................................. 1/sec
# http.requests: ................................................................. 1
# http.response_time:
#   min: ......................................................................... 16
#   max: ......................................................................... 16
#   median: ...................................................................... 16
#   p95: ......................................................................... 16
#   p99: ......................................................................... 16
# http.responses: ................................................................ 1
# vusers.completed: .............................................................. 1
# vusers.created: ................................................................ 1
# vusers.created_by_name.0: ...................................................... 1
# vusers.failed: ................................................................. 0
# vusers.session_length:
#   min: ......................................................................... 119.3
#   max: ......................................................................... 119.3
#   median: ...................................................................... 120.3
#   p95: ......................................................................... 120.3
#   p99: ......................................................................... 120.3


# All VUs finished. Total time: 4 seconds

# --------------------------------
# Summary report @ 12:17:52(+0000)
# --------------------------------

# http.codes.200: ................................................................ 1
# http.request_rate: ............................................................. 1/sec
# http.requests: ................................................................. 1
# http.response_time:
#   min: ......................................................................... 16
#   max: ......................................................................... 16
#   median: ...................................................................... 16
#  p95: ......................................................................... 16
#   p99: ......................................................................... 16
# http.responses: ................................................................ 1
# vusers.completed: .............................................................. 1
# vusers.created: ................................................................ 1
# vusers.created_by_name.0: ...................................................... 1
# vusers.failed: ................................................................. 0
# vusers.session_length:
#   min: ......................................................................... 119.3
#   max: ......................................................................... 119.3
#   median: ...................................................................... 120.3
#   p95: ......................................................................... 120.3
#   p99: ......................................................................... 120.3
```
