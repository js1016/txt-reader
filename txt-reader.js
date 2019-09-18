"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var text_encoding_shim_1 = require("text-encoding-shim");
require("promise-polyfill/src/polyfill");
require("./polyfill");
var lodash_clonedeep_1 = __importDefault(require("lodash.clonedeep"));
var RequestMessage = /** @class */ (function () {
    function RequestMessage(action, data) {
        this.action = action;
        this.data = data !== undefined ? data : null;
    }
    return RequestMessage;
}());
var TxtReaderTaskState;
(function (TxtReaderTaskState) {
    TxtReaderTaskState[TxtReaderTaskState["Initialized"] = 0] = "Initialized";
    TxtReaderTaskState[TxtReaderTaskState["Queued"] = 1] = "Queued";
    TxtReaderTaskState[TxtReaderTaskState["Running"] = 2] = "Running";
    TxtReaderTaskState[TxtReaderTaskState["Completed"] = 3] = "Completed";
})(TxtReaderTaskState || (TxtReaderTaskState = {}));
var TxtReaderTask = /** @class */ (function () {
    function TxtReaderTask(id, reqMsg, parser) {
        var _this = this;
        this.id = id;
        this.requestMessage = reqMsg;
        this.parser = parser;
        this.requestMessage.taskId = id;
        this.state = TxtReaderTaskState.Initialized;
        this.onProgress = null;
        this.startTime = 0;
        // initialize the task promise object, assign the resolve, reject methods.
        this.promise = new Promise(function (resolve, reject) {
            _this.resolve = resolve;
            _this.reject = reject;
        });
    }
    TxtReaderTask.prototype.dispose = function () {
        // release the memory inside promise obejct
        this.resolve = null;
        this.reject = null;
        this.promise = null;
    };
    // run the task, postMessage would be triggered in TxtReader
    // just change the state and record the task start time here
    TxtReaderTask.prototype.run = function () {
        this.state = TxtReaderTaskState.Running;
        this.startTime = new Date().getTime();
    };
    // be called when a task completes no matter it succeeds or fails
    TxtReaderTask.prototype.complete = function (response) {
        this.state = TxtReaderTaskState.Completed;
        var timeTaken = new Date().getTime() - this.startTime;
        if (response.success) {
            var taskResponse = {
                timeTaken: timeTaken,
                message: response.message,
                result: response.result
            };
            this.resolve(taskResponse);
        }
        else {
            this.reject(response.message);
        }
        this.dispose();
    };
    TxtReaderTask.prototype.updateProgress = function (progress) {
        if (this.onProgress !== null) {
            this.onProgress.call(this.parser, progress);
        }
    };
    TxtReaderTask.prototype.then = function (onFulFilled) {
        var _this = this;
        if (this.promise) {
            this.promise.then(function (data) {
                onFulFilled.call(_this.parser, data);
            })["catch"](function (reason) { });
        }
        return this;
    };
    TxtReaderTask.prototype["catch"] = function (onFailed) {
        var _this = this;
        if (this.promise) {
            this.promise["catch"](function (reason) {
                onFailed.call(_this.parser, reason);
            });
        }
        return this;
    };
    TxtReaderTask.prototype.progress = function (onProgress) {
        this.onProgress = onProgress;
        return this;
    };
    return TxtReaderTask;
}());
var TxtReader = /** @class */ (function () {
    function TxtReader() {
        var _this = this;
        this.taskList = [];
        this.runningTask = null;
        this.queuedTaskList = [];
        this.verboseLogging = false;
        this.utf8decoder = new text_encoding_shim_1.TextDecoder('utf-8');
        this.lineCount = 0;
        Object.defineProperty(this, 'lineCount', {
            value: 0,
            writable: false
        });
        this.file = null;
        this.worker = new Worker('txt-reader-worker.js?i=' + new Date().getTime());
        this.worker.addEventListener('message', function (event) {
            if (_this.verboseLogging) {
                console.log('Main thread received a message from worker thread: \r\n', event.data);
            }
            if (_this.runningTask === null) {
                return;
            }
            var response = event.data;
            if (response.taskId !== _this.runningTask.id) {
                throw ("Received task ID (" + response.taskId + ") does not match the running task ID (" + _this.runningTask.id + ").");
            }
            if (response.done) {
                // the task completes
                _this.completeTask(response);
            }
            else {
                // the task is incomplete, means it is a progress message
                if (Object.prototype.toString.call(response.result).toLowerCase() === '[object number]' && response.result >= 0 && response.result <= 100) {
                    _this.runningTask.updateProgress(response.result);
                }
                else {
                    throw ('Unkown message type');
                }
            }
        }, false);
    }
    TxtReader.prototype.sniffLines = function (file, lineNumber, decode) {
        if (decode === void 0) { decode = true; }
        return this.newTask('sniffLines', {
            file: file,
            lineNumber: lineNumber,
            decode: decode
        });
    };
    TxtReader.prototype.loadFile = function (file, config) {
        var _this = this;
        this.file = file;
        Object.defineProperty(this, 'lineCount', {
            value: 0,
            writable: false
        });
        var data = {
            file: file
        };
        if (config) {
            data.config = this.getItertorConfigMessage(lodash_clonedeep_1["default"](config));
        }
        return this.newTask('loadFile', data).then(function (response) {
            Object.defineProperty(_this, 'lineCount', {
                value: response.result.lineCount,
                writable: false
            });
        });
    };
    TxtReader.prototype.setChunkSize = function (chunkSize) {
        return this.newTask('setChunkSize', chunkSize);
    };
    TxtReader.prototype.enableVerbose = function () {
        this.verboseLogging = true;
        return this.newTask('enableVerbose');
    };
    TxtReader.prototype.getLines = function (start, count, decode) {
        var _this = this;
        if (decode === void 0) { decode = true; }
        return this.newTask('getLines', { start: start, count: count }).then(function (response) {
            for (var i = 0; i < response.result.length; i++) {
                if (decode) {
                    response.result[i] = _this.utf8decoder.decode(response.result[i]);
                }
            }
        });
    };
    TxtReader.prototype.getSporadicLines = function (sporadicLinesMap, decode) {
        if (decode === void 0) { decode = true; }
        return this.newTask('getSporadicLines', {
            sporadicLinesMap: sporadicLinesMap,
            decode: decode
        });
    };
    TxtReader.prototype.iterateLines = function (config, start, count) {
        return this.newTask('iterateLines', {
            config: this.getItertorConfigMessage(lodash_clonedeep_1["default"](config)),
            start: start || null,
            count: count || null
        });
    };
    TxtReader.prototype.iterateSporadicLines = function (config, sporadicLinesMap) {
        return this.newTask('iterateSporadicLines', {
            config: this.getItertorConfigMessage(lodash_clonedeep_1["default"](config)),
            lines: sporadicLinesMap
        });
    };
    TxtReader.prototype.getItertorConfigMessage = function (config) {
        var functionMap = [];
        function functionToString(obj, entry) {
            var path = entry;
            if (typeof obj === 'object') {
                for (var i in obj) {
                    var pathi = path + "[\"" + i + "\"]";
                    if (typeof obj[i] === 'function') {
                        obj[i] = obj[i].toString();
                        functionMap.push(pathi);
                    }
                    else if (typeof obj[i] === 'object') {
                        obj[i] = functionToString(obj[i], pathi);
                    }
                }
            }
            return obj;
        }
        return {
            eachLine: config.eachLine.toString(),
            scope: functionToString(config.scope, "") || {},
            functionMap: functionMap
        };
    };
    TxtReader.prototype.newTask = function (action, data) {
        var reqMsg = new RequestMessage(action, data);
        var task = new TxtReaderTask(this.newTaskId(), reqMsg, this);
        this.taskList.push(task);
        if (!this.runningTask) {
            this.runTask(task);
        }
        else {
            this.queuedTaskList.push(task);
            task.state = TxtReaderTaskState.Queued;
        }
        return task;
    };
    TxtReader.prototype.completeTask = function (response) {
        if (this.runningTask) {
            this.runningTask.complete(response);
            this.runningTask = null;
            this.runNextTask();
        }
    };
    TxtReader.prototype.runNextTask = function () {
        if (this.queuedTaskList.length) {
            this.runTask(this.queuedTaskList.shift());
        }
    };
    TxtReader.prototype.runTask = function (task) {
        this.runningTask = task;
        this.worker.postMessage(task.requestMessage);
        task.run();
    };
    TxtReader.prototype.newTaskId = function () {
        var taskListLength = this.taskList.length;
        if (taskListLength === 0) {
            return 1;
        }
        else {
            return this.taskList[taskListLength - 1].id + 1;
        }
    };
    return TxtReader;
}());
exports.TxtReader = TxtReader;
