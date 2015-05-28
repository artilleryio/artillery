'use strict';

var program = require('commander');
var version = require('./package.json').version;

var run = require('./lib/commands/run');
var dino = require('./lib/commands/dino');

program.version(version);
program
  .command('run <script>')
  .description('Run a test script. Example: `minigun run benchmark.json`')
  .option('-p, --payload <path>', 'Set payload file (CSV)')
  .option('-o, --output <path>', 'Set file to write stats to (will output to stdout by default)')
  .action(run);

program
  .command('dino')
  .description('Show dinosaur of the day')
  .action(dino);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}
