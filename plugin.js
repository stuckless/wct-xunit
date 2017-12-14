var Mocha = require('mocha');
var _ = require('lodash');

/**
 * Plugin for Web-Component-Tester.
 *
 * Exports the test results to XUnit XML.
 * Uses the Mocha XUnit reporter internally.
 *
 * WebComponentTester users Mocha reporters but then,
 * for some reason, translates the Mocha runner events into
 * custom wct events.
 *
 * This plugin tries to reverse engineer the structure
 * and information in those events and pass those
 * to a mocha reporter.
 *
 * It would be possible to modify the WCT to propagate
 * all Mocha events, however this implementation is better
 * because it does not require WCT modifications.
 *
 * Mocha test runners will run in a browser, this plugin
 * runs on the server (node).
 *
 * @see web-component-tester/browser/clisocket.js
 * @see mocha/lib/reporters/xunit.js
 * @see https://github.com/mochajs/mocha/blob/master/lib/runner.js#L36
 *
 * @param wct
 * @param pluginOptions
 * @param plugin
 */
module.exports = function(wct, pluginOptions, plugin) {
    // ...
    console.log('starting wct xunit plugin');
    // stores a reporter for each browser instance and test file
    var reporters = [];

    /**
     * stores the last reporter
     *
     * the test runner iterates serially over all test cases.
     * when the browser or the file name change, we create a new
     * reporter.
     * when the last reporter changes, the end date of the reporter
     * is set to correctly calculate the test duration.
     */
    var lastReporter;

    /**
     * Check if we're in a new browser or file.
     * If yes, then instantiate a new reporter and set the
     * end data for the old reporter.
     */
    wct.on('test-start', function(browser, test, stats) {
        // initialize the reporter
        var newReporter = getReporter(reporters, browser, test);

        if (lastReporter && newReporter !== lastReporter) {
            // close old reporter
            lastReporter.stats.end = new Date();
            lastReporter.stats.duration = new Date() - lastReporter.stats.start;
        }
    });

    /**
     * Convert the test object to one that the XUnit-Reporter can understand.
     * Add the converted object to the reporter and set some test statistics.
     */
    wct.on('test-end', function(browser, test, stats) {
        var reporter = getReporter(reporters, browser, test);
        reporter.stats.tests++;

        if (test.state === 'passing') {
            reporter.stats.passes++;
        } else if (test.state === 'failing') {
            reporter.stats.failures++;
        }
        // adapt call to match reporters expected test structure
        reporter.tests.push({
            parent: {
                // must be a function, matches the className in the xunit xml
                fullTitle: function() {
                    // test[0] == fileName, test[1] == tagName
                    return browser.browserName + '.' + test.test[1]; // tag-name
                }
            },
            // the last string is the name of the test method
            title: test.test[test.test.length - 1],
            state: getState(test.state),
            // map to a boolean value
            isPending: function() {return test.state === 'pending'},
            duration: test.duration,
            err: test.err
        });
    });


    /**
     * All tests in a single browser are finished.
     * Write the content of each reporter into a XUnit-compatible XML file.
     *
     * matcher runner.on('end')
     */
    wct.on('browser-end', function(browser, error, stats) {
        for (var fileName in reporters[browser.id]) {
            if (reporters[browser.id].hasOwnProperty(fileName)) {
                var reporter = reporters[browser.id][fileName];

                if (!reporter.stats.end) {
                    // make sure the last reporter is also properly closed
                    reporter.stats.end = new Date();
                    reporter.stats.duration = new Date() - reporter.stats.start;
                }
                var reporterStats = reporter.stats;
                reporter.write(tag('testsuite', {
                    /**
                     * !!! IMPORTANT
                     * Jenkins determines new test results depending on the name and timestamp.
                     * The timestamps can be the same for multiple files if tests run very fast.
                     * In that case, at least the name attribute must be different, otherwise
                     * a file may be silently ignored by Jenkins.
                     */
                    name: browser.browserName + '.' + fileName,
                    tests: reporterStats.tests,
                    failures: reporterStats.failures,
                    errors: reporterStats.failures,
                    skipped: reporterStats.tests - reporterStats.failures - reporterStats.passes,
                    timestamp: (new Date()).toUTCString(),
                    time: (reporterStats.duration / 1000) || 0
                }, false));

                reporter.tests.forEach(function(t) {
                    reporter.test(t);
                });
                reporter.write('</testsuite>');
            }
        }
    });
};

function getState(state) {
    "use strict";

    if (state === 'passing') {
        return 'passed';
    } else if (state === 'failing') {
        return 'failed';
    }
    else return null;
}

function getReporter(reporters, browser, test) {
    var browserReporters = reporters[browser.id];

    if (!browserReporters) {
        browserReporters = {};
        reporters[browser.id] = browserReporters;
    }
    var fileName = test.test[0];
    var fileReporter = browserReporters[fileName];

    if (!fileReporter) {
        fileReporter = new Mocha.reporters.XUnit({
            /**
             * Fakes a Mocha test runner.
             * The XUnit reporter uses the function to register
             * event listeners on the test runner.
             *
             * Since we only use the XML formatting functionality of
             * the XUnit reporter, an empty function  to prevent
             * runtime errors is sufficient.
             */
            on: function() {
            }
        }, {
            reporterOptions: {
                output: 'build/test-results/' + fileName + '-' + browser.browserName + '-' + browser.version + '.xml'
            }
        });
        fileReporter.tests = [];
        fileReporter.stats.start = new Date();
        fileReporter.stats.tests = 0;
        fileReporter.stats.passes = 0;
        fileReporter.stats.failures = 0;
        browserReporters[fileName] = fileReporter;
    }
    return fileReporter;
}

/**
 * TODO copied from XUnit Reporter
 */

/**
 * HTML tag helper.
 *
 * @param name
 * @param attrs
 * @param close
 * @param content
 * @return {string}
 */
function tag(name, attrs, close, content) {
    var end = close ? '/>' : '>';
    var pairs = [];
    var tag;

    for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
            pairs.push(key + '="' + escape(attrs[key]) + '"');
        }
    }

    tag = '<' + name + (pairs.length ? ' ' + pairs.join(' ') : '') + end;
    if (content) {
        tag += content + '</' + name + end;
    }
    return tag;
}

/**
 * Return cdata escaped CDATA `str`.
 */

function cdata(str) {
    return '<![CDATA[' + escape(str) + ']]>';
}
