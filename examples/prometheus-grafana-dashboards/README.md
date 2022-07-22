# Prometheus Grafana Dashboards

This a collection of Grafana dashboards that visualise Artillery test result data collected using the 
[Prometheus](https://www.artillery.io/docs/guides/plugins/plugin-publish-metrics#prometheus-pushgateway) 
target of the [publish-metrics](https://www.artillery.io/docs/guides/plugins/plugin-publish-metrics) plugin.

The dashboards were exported as JSON and [can be easily imported into Grafana](https://grafana.com/docs/grafana/latest/dashboards/export-import/#import-dashboard).

__NOTE__

The data is collected by Prometheus using the Pushgateway, this caches the data so the graphs never reset to zero.

This means as a user viewing the data, the last value will keep repeating indefinitely.

Generally, this is the expected behaviour when using the Pushgateway.

See, [Should I be using the Pushgateway](https://prometheus.io/docs/practices/pushing/).
And this [Stack Overflow ticket](https://stackoverflow.com/questions/60039289/how-to-display-zero-instead-of-last-value-in-prometheus-grafana).

## vusers metrics

This dashboard, `dashboard-vusers-metrics-1652971366368.json`, visualizes `vusers` metrics.  

## http metrics

This dashboard, `dashboard-http-metrics-1652971310916.json`, visualizes `http` metrics.  
