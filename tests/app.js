require('./page.css');
const TxtReader = require('./../txt-reader.js').TxtReader;
'use strict';

var txtReader = new TxtReader();
var $console = $('#console');
var $running = $('#running');

var log = function log(message) {
    appendLog(message, 'log');
};

var error = function error(message) {
    appendLog('Error: ' + message, 'error');
};

var success = function success(message) {
    appendLog(message, 'success');
};

var appendLog = function appendLog(message, className) {
    $('<div></div>').addClass(className).html(message).appendTo($console);
    var scrollHeight = $console[0].scrollHeight;
    var offsetHeight = $console[0].offsetHeight;
    if (scrollHeight - offsetHeight > 0) {
        $console[0].scrollTop = scrollHeight - offsetHeight;
    }
};

var clearConsole = function clearConsole() {
    $console.html('');
};

var showRunning = function showRunning() {
    $running.removeClass('hide');
};

var hideRunning = function hideRunning() {
    $running.addClass('hide');
};

$('#load-file').click(function () {
    showRunning();
    clearConsole();
    var iisLogFile = document.getElementById('file-input').files[0];
    txtReader.loadFile(iisLogFile).progress(function (progress) {
        log('Loading file progress: ' + progress + '%.');
    }).then(function (response) {
        console.log(response);
        success('Load file (' + this.file.name + ') successfully, time taken: ' + response.timeTaken + 'ms.');
        hideRunning();
    }).catch(function (reason) {
        error(reason);
        hideRunning();
    });
});

$('#set-chunk-size').click(function () {
    showRunning();
    clearConsole();
    var chunkSize = Number($('#chunk-size').val());
    txtReader.setChunkSize(chunkSize).then(function (response) {
        success('Set chunk size to: ' + response.result);
        hideRunning();
    }).catch(function (reason) {
        error(reason);
        hideRunning();
    });
});

$('#get-line-count').click(function () {
    clearConsole();
    success(txtReader.lineCount.toString());
});

$('#clear-console').click(function () {
    clearConsole();
});

$('#get-lines').click(function () {
    showRunning();
    clearConsole();
    var start = Number($('#start-line').val());
    var count = Number($('#count').val());
    txtReader.getLines(start, count).progress(function (progress) {
        log('Getting lines progress: ' + progress + '%.');
    }).then(function (response) {
        success('First line: ' + response.result[0]);
        success('Last line: ' + response.result[response.result.length - 1]);
        success('Successfully get ' + response.result.length + ' lines, Time taken: ' + response.timeTaken);
        hideRunning();
    }).catch(function (reason) {
        error(reason);
        hideRunning();
    });
});

$('#iterate-lines').click(function () {
    showRunning();
    clearConsole();
    var start = Number($('#start-line').val()) || null;
    var count = Number($('#count').val()) || null;
    txtReader.iterateLines({
        eachLine: function (value, progress, lineNumber) {
            if (lineNumber === this.start) {
                this.first = this.decode(value);
            }
            if (lineNumber === this.end) {
                this.last = this.decode(value);
            }
            this.lineCount++;
        },
        scope: {
            lineCount: 0,
            start: start,
            end: start + count - 1,
            first: null,
            last: null
        }
    }, start, count).progress(function (progress) {
        log('Iterating lines progress: ' + progress + '%.');
    }).then(function (response) {
        success('First line: ' + response.result.first);
        success('Last line: ' + response.result.last);
        success('Successfully iterated ' + response.result.lineCount + ' lines, Time taken: ' + response.timeTaken);
        hideRunning();
    }).catch(function (reason) {
        error(reason);
        hideRunning();
    });
});

$('#sniff-lines').click(function () {
    showRunning();
    clearConsole();
    var lineNumber = $('#sniff-line-number').val();
    //var fromBeginToEnd = $('#sniff-line-begin-to-end').val() === 'true';
    var iisLogFile = document.getElementById('file-input').files[0];
    txtReader.sniffLines(iisLogFile, Number(lineNumber))
        .progress(function (response) {
            log(`Sniffing progress: ${progress} %.`);
        })
        .then(function (response) {
            success('First line: ' + response.result[0]);
            success('Last line: ' + response.result[response.result.length - 1]);
            success(`Successfully sniffed ${response.result.length} lines, Time taken: ${response.timeTaken}`);
            hideRunning();
        }).catch(function (reason) {
            error(reason);
            hideRunning();
        })
});

$('#get-sporadic-lines').click(function () {
    showRunning();
    clearConsole();
    let lines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, { start: 500, count: 30 }, { start: 900, count: 3008 }];
    txtReader.getSporadicLines([1, 3, { start: 100, count: 5 }, { start: 200, end: 205 }])
        .progress(function (progress) {

        })
        .then(function (response) {
            response.result
        })
        .catch(function (reason) {

        });
    txtReader.getSporadicLines(lines)
        .progress(function (progress) {
            log(`Getting Sporadic Lines progress: ${progress}`)
        })
        .then(function (response) {
            let first = response.result[0];
            let last = response.result[response.result.length - 1];
            success(`First line (${first.lineNumber}): ${first.value}`);
            success(`Last line (${last.lineNumber}): ${last.value}`);
            success(`Successfully get ${response.result.length} lines, Time taken: ${response.timeTaken}`);
        })
        .catch(function (reason) {
            error(reason);
            hideRunning();
        })
});

$('#iterate-sporadic-lines').click(function () {
    showRunning();
    clearConsole();
    let lines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, { start: 500, count: 30 }, { start: 900, count: 3008 }];
    txtReader.iterateSporadicLines({
        eachLine: function (raw, progress, lineNumber) {
            let value = this.decode(raw);
            console.log(progress, lineNumber);
            this.arr.push({
                value: value,
                lineNumber: lineNumber
            })
        },
        scope: {
            arr: []
        }
    }, lines)
        .progress(function (progress) {
            log(`Iterating Sporadic Lines progress: ${progress}`)
        })
        .then(function (response) {
            console.log(response);
        })
        .catch(function (reason) {
            error(reason);
            hideRunning();
        })
});

$('#test-button').click(function () {
    var a = [{ "start": 7, "end": 7 }, { "start": 2190, "end": 2190 }, 250000, { "start": 4026, "end": 4026 }, { "start": 5854, "end": 5854 }, { "start": 7878, "end": 7878 }, { "start": 9403, "end": 9403 }, { "start": 13603, "end": 13603 }, { "start": 28620, "end": 28620 }, { "start": 41700, "end": 41700 }, { "start": 54689, "end": 54689 }, { "start": 67234, "end": 67234 }, { "start": 77757, "end": 77757 }, { "start": 89497, "end": 89497 }, { "start": 100841, "end": 100841 }, { "start": 112256, "end": 112256 }, { "start": 123626, "end": 123626 }, { "start": 132729, "end": 132729 }, { "start": 142833, "end": 142833 }, { "start": 152553, "end": 152553 }, { "start": 162025, "end": 162025 }, { "start": 171179, "end": 171179 }, { "start": 180538, "end": 180538 }, { "start": 188319, "end": 188319 }, { "start": 196443, "end": 196443 }, { "start": 205384, "end": 205384 }, { "start": 213725, "end": 213725 }, { "start": 221685, "end": 221685 }, { "start": 229907, "end": 229907 }, { "start": 238461, "end": 238461 }, { "start": 245928, "end": 245928 }, { "start": 253581, "end": 253581 }, { "start": 260711, "end": 260711 }, { "start": 267371, "end": 267371 }, { "start": 273589, "end": 273589 }, { "start": 280926, "end": 280926 }, { "start": 287862, "end": 287862 }, { "start": 294502, "end": 294502 }, { "start": 301756, "end": 301756 }, { "start": 308525, "end": 308525 }, { "start": 314859, "end": 314859 }, { "start": 321103, "end": 321103 }, { "start": 326508, "end": 326508 }, { "start": 332359, "end": 332359 }, { "start": 338772, "end": 338772 }, { "start": 344758, "end": 344758 }, { "start": 350171, "end": 350171 }, { "start": 356292, "end": 356292 }, { "start": 362553, "end": 362553 }, { "start": 368216, "end": 368216 }, { "start": 373584, "end": 373584 }, { "start": 378073, "end": 378073 }, { "start": 383875, "end": 383875 }, { "start": 389599, "end": 389599 }, { "start": 394917, "end": 394917 }, { "start": 401110, "end": 401110 }, { "start": 407309, "end": 407309 }, { "start": 413231, "end": 413231 }, { "start": 418480, "end": 418480 }, { "start": 424146, "end": 424146 }, { "start": 430493, "end": 430493 }, { "start": 435372, "end": 435372 }, { "start": 440327, "end": 440327 }, { "start": 446866, "end": 446866 }, { "start": 453207, "end": 453207 }, { "start": 458937, "end": 458937 }, { "start": 463994, "end": 463994 }, { "start": 471063, "end": 471063 }, { "start": 477355, "end": 477355 }, { "start": 483781, "end": 483781 }, { "start": 491011, "end": 491011 }, { "start": 497348, "end": 497348 }, { "start": 504136, "end": 504136 }, { "start": 511946, "end": 511946 }, { "start": 518767, "end": 518767 }, { "start": 526083, "end": 526083 }, { "start": 534992, "end": 534992 }, { "start": 542936, "end": 542936 }, { "start": 551656, "end": 551656 }, { "start": 560172, "end": 560172 }, { "start": 568017, "end": 568017 }, { "start": 576866, "end": 576866 }, { "start": 585474, "end": 585474 }, { "start": 594813, "end": 594813 }, { "start": 606800, "end": 606800 }, { "start": 618552, "end": 618552 }, { "start": 631805, "end": 631805 }, { "start": 645003, "end": 645003 }, { "start": 658414, "end": 658414 }, { "start": 673205, "end": 673205 }, { "start": 687497, "end": 687497 }, { "start": 702034, "end": 702034 }, { "start": 716674, "end": 716674 }, { "start": 730961, "end": 730961 }, { "start": 747343, "end": 747343 }, { "start": 764761, "end": 764761 }, { "start": 783151, "end": 783151 }, { "start": 801514, "end": 801514 }, { "start": 819124, "end": 819124 }, { "start": 840593, "end": 840593 }, { "start": 862505, "end": 862505 }, { "start": 886172, "end": 886172 }, { "start": 910720, "end": 910720 }, { "start": 934916, "end": 934916 }, { "start": 958499, "end": 958499 }, { "start": 986032, "end": 986032 }, { "start": 1013067, "end": 1013067 }, { "start": 1038293, "end": 1038293 }, { "start": 1064362, "end": 1064362 }, { "start": 1093124, "end": 1093124 }, { "start": 1120753, "end": 1120753 }, { "start": 1153186, "end": 1153186 }, { "start": 1185794, "end": 1185794 }, { "start": 1219539, "end": 1219539 }, { "start": 1251495, "end": 1251495 }, { "start": 1283777, "end": 1283777 }, { "start": 1318145, "end": 1318145 }, { "start": 1356461, "end": 1356461 }, { "start": 1392062, "end": 1392062 }, { "start": 1428174, "end": 1428174 }, { "start": 1462768, "end": 1462768 }, { "start": 1495001, "end": 1495001 }, { "start": 1529847, "end": 1529847 }];
    a = [1, 2, 3, 4, 5, 6];
    //a = [10000, 680000, 1350000, 2020000, 2690000, 3360000, 4030000, 4700000, 5370000, 6040000, 6710000, 7380000, 8050000, 8720000, 9390000, 10060000, 10730000, 11400000, 12070000, 12740000, 13410000]
    //a = [1, 13497881]
    console.log('start');
    // txtReader.getSporadicLines(a)
    //     .progress(function (progress) {
    //         log(`Getting Sporadic Lines progress: ${progress}`)
    //     })
    //     .then(function (response) {
    //         console.log(`done, response:`, response);
    //     })
    txtReader.iterateSporadicLines({
        eachLine: function (raw, progress, lineNumber) {
            let str = this.decode(raw);
            this.result.push(str);
            console.log(str, lineNumber);
        },
        scope: {
            result: []
        }
    }, a)
        .progress(function (progress) {
            log(`Getting Sporadic Lines progress: ${progress}`)
        })
        .then(function (response) {
            console.log(`done`, response);
        });
})

window.txtReader = txtReader;