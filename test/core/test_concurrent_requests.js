'use strict';

const test = require('tape');
const runner = require('../../core/lib/runner').runner;

test('scenarios avoided - arrival rate', function(t) {
    var script = require('./scripts/concurrent_requests_arrival_rate.json');
    runner(script).then(function(ee) {
        ee.on('phaseStarted', function(info) {
            console.log('Starting phase: %j - %s', info, new Date());
        });
        ee.on('phaseCompleted', function() {
            console.log('Phase completed - %s', new Date());
        });

        ee.on('done', function(stats) {
            t.assert(stats.codes['200'] > 0, 'should receive some 200s');
            t.assert(stats.scenariosAvoided > 0, 'should avoid some scenarios');
            t.end();
        });
        ee.run();
    });
});

test('scenarios avoided - arrival count', function(t) {
    var script = require('./scripts/concurrent_requests_arrival_count.json');
    runner(script).then(function(ee) {
        ee.on('phaseStarted', function(info) {
            console.log('Starting phase: %j - %s', info, new Date());
        });
        ee.on('phaseCompleted', function() {
            console.log('Phase completed - %s', new Date());
        });

        ee.on('done', function(stats) {
            t.assert(stats.codes['200'] > 0, 'should receive some 200s');
            t.assert(stats.scenariosAvoided > 0, 'should avoid some scenarios');
            t.end();
        });
        ee.run();
    });
});

test('scenarios avoided - ramp to', function(t) {
    var script = require('./scripts/concurrent_requests_ramp_to.json');
    runner(script).then(function(ee) {
        ee.on('phaseStarted', function(info) {
            console.log('Starting phase: %j - %s', info, new Date());
        });
        ee.on('phaseCompleted', function() {
            console.log('Phase completed - %s', new Date());
        });

        ee.on('done', function(stats) {
            t.assert(stats.codes['200'] > 0, 'should receive some 200s');
            t.assert(stats.scenariosAvoided > 0, 'should avoid some scenarios');
            t.end();
        });
        ee.run();
    });
});

test('scenarios avoided - multiple phases', function(t) {
    var script = require('./scripts/concurrent_requests_multiple_phases.json');
    runner(script).then(function(ee) {
        ee.on('phaseStarted', function(info) {
            console.log('Starting phase: %j - %s', info, new Date());
        });
        ee.on('phaseCompleted', function() {
            console.log('Phase completed - %s', new Date());
        });

        ee.on('done', function(stats) {
            t.assert(stats.codes['200'] > 0, 'should receive some 200s');
            t.assert(stats.scenariosAvoided > 0, 'should avoid some scenarios');
            t.assert(stats.scenariosAvoided < 1000, 'should avoid less than 1000');
            t.end();
        });
        ee.run();
    });
});
