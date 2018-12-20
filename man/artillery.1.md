artillery -- backend & API testing toolkit
===============================================

## DESCRIPTION

Artillery is a toolkit for load testing and functional testing of backend services & APIs. It supports HTTP, WebSocket, and Socket.io out of the box, and can be extended with plugins.

## SYNOPSIS

The artillery CLI has several commands. Run artillery --help to see all of the available commands:

```
artillery --help


Usage: artillery [options] [command]


Commands:

  run [options] <script>  Run a test script. Example: `artillery run benchmark.yml`
  quick [options] <url>   Run a quick test without writing a test script
  report <file>           Create a report from a JSON file created by "artillery run"

Options:

  -h, --help     output usage information
  -V, --version  output the version number
```

To see detailed help on a specific artillery command, use the --help flag with that command, e.g. artillery run --help.

## WWW

https://artillery.io
