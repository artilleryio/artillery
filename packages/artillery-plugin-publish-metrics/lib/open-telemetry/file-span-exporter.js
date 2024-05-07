'use strict';

const fs = require('fs');
const path = require('path');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { ExportResultCode } = require('@opentelemetry/core');

// We extend ConsoleSpanExporter as the logic is almost the same, we just need to write to a file instead of log to console
class FileSpanExporter extends ConsoleSpanExporter {
  constructor(opts) {
    super();
    this.filePath = this.setOutputPath(opts.output);

    // We create the file in the main thread and then append to it in the worker threads
    if (typeof process.env.LOCAL_WORKER_ID === 'undefined') {
      // We write the '[' here to open an array in the file, so we can append spans to it
      fs.writeFileSync(this.filePath, '[\n', { flag: 'w' });
    }
  }

  _sendSpans(spans, done) {
    const spansToExport = spans.map((span) =>
      JSON.stringify(this._exportInfo(span))
    );
    if (spansToExport.length > 0) {
      fs.writeFileSync(this.filePath, spansToExport.join(',\n') + ',', {
        flag: 'a'
      }); // TODO fix trailing coma
    }
    if (done) {
      return done({ code: ExportResultCode.SUCCESS });
    }
  }

  shutdown() {
    this._sendSpans([]);
    this.forceFlush();
    if (typeof process.env.LOCAL_WORKER_ID === 'undefined') {
      try {
        // Removing the trailing comma and closing the array
        const data =
          fs.readFileSync(this.filePath, 'utf8').slice(0, -1) + '\n]';
        fs.writeFileSync(this.filePath, data, { flag: 'w' });
        console.log('File updated successfully.');
      } catch (err) {
        console.error('FileSpanExporter: Error updating file:');
        throw err;
      }
    }
  }

  setOutputPath(output) {
    const defaultFileName = `otel-spans-${global.artillery.testRunId}.json`;
    const defaultOutputPath = path.resolve(process.cwd(), defaultFileName);
    if (!output) {
      return defaultOutputPath;
    }

    const isFile = path.extname(output);
    const exists = isFile
      ? fs.existsSync(path.dirname(output))
      : fs.existsSync(output);

    if (!exists) {
      throw new Error(`FileSpanExporter: Path '${output}' does not exist`);
    }
    return isFile ? output : path.resolve(output, defaultFileName);
  }
}

module.exports = {
  FileSpanExporter
};
