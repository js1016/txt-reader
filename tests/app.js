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
        eachLine: function (value) {
            if (this.first === null) {
                this.first = this.decode(value);
            }
            this.last = this.decode(value);
            this.lineCount++;
        },
        scope: {
            lineCount: 0,
            first: null,
            last: null,
            test: function (raw) {

            }
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
        .progress(progress => {
            log(`Sniffing progress: ${progress} %.`);
        })
        .then(response => {
            success('First line: ' + response.result[0]);
            success('Last line: ' + response.result[response.result.length - 1]);
            success(`Successfully sniffed ${response.result.length} lines, Time taken: ${response.timeTaken}`);
            hideRunning();
        }).catch(reason => {
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
        .then(response => {
            let first = response.result[0];
            let last = response.result[response.result.length - 1];
            success(`First line (${first.lineNumber}): ${first.value}`);
            success(`Last line (${last.lineNumber}): ${last.value}`);
            success(`Successfully get ${response.result.length} lines, Time taken: ${response.timeTaken}`);
        })
        .catch(reason => {
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
        .then(response => {
            console.log(response);
        })
        .catch(reason => {
            error(reason);
            hideRunning();
        })
});

window.txtReader = txtReader;