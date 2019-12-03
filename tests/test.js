"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var lineReader = require("line-reader");
var path = require("path");
var chai = require("chai");
var util_1 = require("util");
var TestFile = /** @class */ (function () {
    function TestFile(fileName, cb) {
        var _this = this;
        this.lines = [];
        this.filePath = __dirname + "/samples/" + fileName;
        lineReader.eachLine(this.filePath, function (line, last) {
            _this.lines.push(line);
            if (_this.lines.length === 1 && _this.lines[0].charCodeAt(0) === 65279) {
                _this.lines[0] = _this.lines[0].substr(1);
            }
            if (last) {
                cb();
            }
        });
    }
    return TestFile;
}());
var testFiles = [];
var decoder = new util_1.TextDecoder('utf-8');
var currentMethod = '';
module.exports = {
    before: function (browser, done) {
        testFiles.push(new TestFile('mixed-eol-6-lines.txt', function () {
            testFiles.push(new TestFile('CBS.log', function () {
                done();
            }));
        }));
    },
    after: function (browser) {
        browser.end();
    },
    'Navigate to http://localhost:8081': function (browser) {
        browser.url('http://localhost:8081/')
            .waitForElementVisible('#file-input', 2000);
    },
    'Test empty loadFile': function (browser) {
        browser.click('#execute')
            .waitForElementNotPresent('.status.running', 10000);
        browser.expect.element('#console .error').to.be.present;
    },
    'Test mixed-eol-6-lines.txt': function (browser) {
        return __awaiter(this, void 0, void 0, function () {
            var testFile, i;
            return __generator(this, function (_a) {
                testFile = testFiles[0];
                setChunkSize(1, browser);
                // for (let i = 1; i <= testFile.lines.length + 1; i++) {
                //     testSniffFile(testFile, browser, i);
                // }
                // testSniffFile(testFile, browser, testFile.lines.length, false);
                // testSniffFile(testFile, browser, 0);
                testLoadFile(testFile, browser);
                testLoadFile(testFile, browser, true);
                for (i = 1; i <= testFile.lines.length; i++) {
                    testGetLines(browser, testFile, i, 1);
                }
                testGetLines(browser, testFile, 1, testFile.lines.length + 1, false);
                testGetLines(browser, testFile, testFile.lines.length + 1, 1, false);
                testGetLines(browser, testFile, 0, 1, false);
                // for (let i = 1; i <= testFile.lines.length; i++) {
                //     testIterateLines(browser, testFile, i, 1);
                // }
                // testIterateLines(browser, testFile, testFile.lines.length + 1, 1);
                // testIterateLines(browser, testFile, 0, 1);
                // testIterateLines(browser, testFile, Math.ceil(testFile.lines.length / 2), testFile.lines.length);
                resetChunkSize(browser); // to do: need to remove as getSporadicLines has bug when chunk size is 1
                testLoadFile(testFile, browser);
                return [2 /*return*/];
            });
        });
    },
    'Test CBS.log': function (browser) {
        resetChunkSize(browser);
        var testFile = testFiles[1];
        //testSniffFile(testFile, browser, 1000);
        testLoadFile(testFiles[1], browser, true);
        for (var i = 1; i <= testFile.lines.length; i += 10000) {
            testGetLines(browser, testFile, i, 10000);
        }
        testGetLinesMultiple(browser, testFile, 10);
        testGetLinesMultiple(browser, testFile, 100);
        testGetLinesMultiple(browser, testFile, 1000);
        testGetLinesMultiple(browser, testFile, 10000);
        for (var i = 0; i < 10; i++) {
            testGetLinesRandom(browser, testFile, true);
        }
        // for (let i = 1; i <= testFile.lines.length; i += 5000) {
        //     testIterateLines(browser, testFile, i, 5000);
        // }
        // testGetSporadicLines(browser, testFile, Math.ceil(testFile.lines.length / 2));
        // testIterateSporadicLines(browser, testFile, Math.ceil(testFile.lines.length / 2));
    }
};
function testIterateLines(browser, testFile, start, count) {
    return __awaiter(this, void 0, void 0, function () {
        var expectStart, expectEnd;
        return __generator(this, function (_a) {
            browser.click('#iterateLines', function () {
                currentMethod = 'iterateLines';
            })
                .clearValue('#start')
                .setValue('#start', start.toString())
                .clearValue('#count')
                .setValue('#count', count.toString())
                .click('#iterate-action option[value="2"]');
            browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
            if (start > testFile.lines.length || start < 1) {
                browser.expect.element('#console .error').to.be.present;
            }
            else {
                expectStart = start;
                if (start < 1) {
                    expectStart = 1;
                }
                expectEnd = start + count - 1;
                if (expectEnd > testFile.lines.length) {
                    expectEnd = testFile.lines.length;
                }
                verifyIterateResult(browser, testFile, expectStart, expectEnd);
            }
            return [2 /*return*/];
        });
    });
}
function getStart(item) {
    if (typeof item === 'number') {
        return item;
    }
    else {
        return item.start;
    }
}
function getEnd(item) {
    return typeof item === 'number' ? item : item.end;
}
function testIterateSporadicLines(browser, testFile, lineCount) {
    return __awaiter(this, void 0, void 0, function () {
        var map, _a, _b, expectStart, expectEnd;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    browser.click('#iterateSporadicLines', function () {
                        currentMethod = 'iterateSporadicLines';
                    })
                        .clearValue('#sporadic-line-count')
                        .setValue('#sporadic-line-count', lineCount.toString())
                        .click('#iterate-action option[value="2"]');
                    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, getValue(browser, '#sporadic-lines-map')];
                case 1:
                    map = _b.apply(_a, [_c.sent()]);
                    expectStart = getStart(map[0]);
                    expectEnd = getEnd(map[map.length - 1]);
                    if (expectStart < 1) {
                        expectStart = 0;
                    }
                    if (expectEnd > testFile.lines.length) {
                        expectEnd = testFile.lines.length;
                    }
                    verifyIterateResult(browser, testFile, expectStart, expectEnd);
                    return [2 /*return*/];
            }
        });
    });
}
function verifyIterateResult(browser, testFile, expectStart, expectEnd) {
    return __awaiter(this, void 0, void 0, function () {
        var firstLineRegExp, lastLineRegExp, echoElements;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    firstLineRegExp = /^First line \((\d+)\): (.+)?$/;
                    lastLineRegExp = /^Last line \((\d+)\): (.+)?$/;
                    return [4 /*yield*/, getElements(browser, '#console .echo')];
                case 1:
                    echoElements = _a.sent();
                    echoElements.forEach(function (echoElement) { return __awaiter(_this, void 0, void 0, function () {
                        var text, isFirst, regexp, match, lineNumber, content, expectContent;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, getTextFromElementId(browser, echoElement.ELEMENT)];
                                case 1:
                                    text = _a.sent();
                                    isFirst = text.startsWith('First');
                                    regexp = isFirst ? firstLineRegExp : lastLineRegExp;
                                    match = regexp.exec(text);
                                    chai.expect(match).not.to.be["null"];
                                    if (match) {
                                        lineNumber = Number(match[1]);
                                        if (isFirst) {
                                            chai.expect(lineNumber, "First line number should be " + expectStart).to.be.equal(expectStart);
                                        }
                                        else {
                                            chai.expect(lineNumber, "Last line number should be " + expectEnd).to.be.equal(expectEnd);
                                        }
                                        content = match[2];
                                        expectContent = testFile.lines[lineNumber - 1];
                                        chai.expect(content, "Line " + lineNumber + " should be: " + expectContent).to.be.equal(expectContent);
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/];
            }
        });
    });
}
function testGetSporadicLines(browser, testFile, lineCount, decode) {
    if (decode === void 0) { decode = true; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    browser.click('#getSporadicLines', function () {
                        currentMethod = 'getSporadicLines';
                    })
                        .clearValue('#sporadic-line-count')
                        .setValue('#sporadic-line-count', lineCount.toString());
                    return [4 /*yield*/, toggleCheckbox(browser, '#decode-checkbox', decode)];
                case 1:
                    _a.sent();
                    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
                    verifyGetResult(testFile, browser);
                    return [2 /*return*/];
            }
        });
    });
}
function testGetLinesMultiple(browser, testFile, lineNumber, decode) {
    if (decode === void 0) { decode = true; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            browser.click('#getLines', function () {
                currentMethod = 'getLines';
            })
                .clearValue('#autogen-linenumber')
                .setValue('#autogen-linenumber', lineNumber.toString());
            _testGetLines(browser, testFile, decode);
            return [2 /*return*/];
        });
    });
}
function testGetLinesRandom(browser, testFile, decode) {
    if (decode === void 0) { decode = true; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            browser.click('#getLines', function () {
                currentMethod = 'getLines';
            })
                .clearValue('#random-linenumber')
                .setValue('#random-linenumber', '1000')
                .click('#generate-random');
            _testGetLines(browser, testFile, decode);
            return [2 /*return*/];
        });
    });
}
function _testGetLines(browser, testFile, decode) {
    if (decode === void 0) { decode = true; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, toggleCheckbox(browser, '#decode-checkbox', decode)];
                case 1:
                    _a.sent();
                    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
                    verifyGetResult(testFile, browser);
                    return [2 /*return*/];
            }
        });
    });
}
function testGetLines(browser, testFile, start, count, decode) {
    if (decode === void 0) { decode = true; }
    return __awaiter(this, void 0, void 0, function () {
        var linesRangesJSONstring;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    linesRangesJSONstring = count === 1 ? "[" + start + "]" : "[{\"start\":" + start + ",\"end\":" + (start + count - 1) + "}]";
                    browser.click('#getLines', function () {
                        currentMethod = 'getLines';
                    });
                    return [4 /*yield*/, toggleCheckbox(browser, '#sporadic-customize', true)];
                case 1:
                    _a.sent();
                    browser.clearValue('#lines-ranges')
                        .setValue('#lines-ranges', linesRangesJSONstring);
                    _testGetLines(browser, testFile, decode);
                    return [2 /*return*/];
            }
        });
    });
}
function testSniffFile(testFile, browser, sniffCount, decode) {
    if (decode === void 0) { decode = true; }
    return __awaiter(this, void 0, void 0, function () {
        var filename;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    filename = path.resolve(testFile.filePath);
                    browser.setValue('#file-input', filename)
                        .click('#sniffLines', function () {
                        currentMethod = 'sniffLines';
                    })
                        .clearValue('#line-number-input')
                        .setValue('#line-number-input', sniffCount.toString());
                    return [4 /*yield*/, toggleCheckbox(browser, '#decode-checkbox', decode)];
                case 1:
                    _a.sent();
                    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
                    if (sniffCount < 1) {
                        browser.expect.element('#console .error').to.be.present;
                    }
                    else {
                        verifyGetResult(testFile, browser);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function verifyGetResult(testFile, browser) {
    return __awaiter(this, void 0, void 0, function () {
        var decode, matchReg, expectResultCount, linesRanges, _a, _b, lines, lineCount, _c, sniffCount, _d, pageCount, _e, i, all, outputs;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, isChecked(browser, '#decode-checkbox')];
                case 1:
                    decode = _f.sent();
                    matchReg = /^(\d+): (.+)?$/;
                    expectResultCount = 0;
                    if (!(currentMethod === 'getLines')) return [3 /*break*/, 3];
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, getValue(browser, '#lines-ranges')];
                case 2:
                    linesRanges = _b.apply(_a, [_f.sent()]);
                    lines = processLinesRanges(linesRanges, testFile.lines.length);
                    expectResultCount = lines.length;
                    return [3 /*break*/, 7];
                case 3:
                    if (!(currentMethod === 'getSporadicLines')) return [3 /*break*/, 5];
                    _c = Number;
                    return [4 /*yield*/, getValue(browser, '#sporadic-line-count')];
                case 4:
                    lineCount = _c.apply(void 0, [_f.sent()]);
                    expectResultCount = lineCount;
                    if (lineCount > testFile.lines.length) {
                        expectResultCount = testFile.lines.length;
                    }
                    return [3 /*break*/, 7];
                case 5:
                    if (!(currentMethod === 'sniffLines')) return [3 /*break*/, 7];
                    _d = Number;
                    return [4 /*yield*/, getValue(browser, '#line-number-input')];
                case 6:
                    sniffCount = _d.apply(void 0, [_f.sent()]);
                    expectResultCount = sniffCount;
                    if (expectResultCount > testFile.lines.length) {
                        expectResultCount = testFile.lines.length;
                    }
                    _f.label = 7;
                case 7:
                    if (!(expectResultCount === 0)) return [3 /*break*/, 8];
                    browser.expect.element('#console .error').to.be.present;
                    return [3 /*break*/, 13];
                case 8:
                    browser.expect.element('#result-count').text.to.be.equal(expectResultCount.toString());
                    _e = Number;
                    return [4 /*yield*/, getText(browser, '#page-count')];
                case 9:
                    pageCount = _e.apply(void 0, [_f.sent()]);
                    i = 1;
                    _f.label = 10;
                case 10:
                    if (!(i <= pageCount)) return [3 /*break*/, 13];
                    browser
                        .clearValue('#page-number')
                        .setValue('#page-number', i.toString())
                        .click('#go')
                        .waitForElementPresent('#console .echo', 1000);
                    return [4 /*yield*/, getText(browser, '#console')];
                case 11:
                    all = _f.sent();
                    outputs = all.split('\n');
                    outputs.forEach(function (item) {
                        var match = matchReg.exec(item);
                        chai.expect(match).not.to.be["null"];
                        if (match) {
                            var lineNumber = Number(match[1]);
                            var content = match[2] ? match[2] : '';
                            if (!decode && content.length > 0) {
                                var outputArr = new Uint8Array(content.split(',').map(function (i) {
                                    return Number(i);
                                }));
                                content = decoder.decode(outputArr);
                            }
                            var expectContent = testFile.lines[lineNumber - 1];
                            chai.expect(content, "Line " + lineNumber + " should be: " + expectContent).to.be.equal(expectContent);
                        }
                    });
                    _f.label = 12;
                case 12:
                    i++;
                    return [3 /*break*/, 10];
                case 13: return [2 /*return*/];
            }
        });
    });
}
function processLinesRanges(linesRanges, lineCount) {
    var result = [];
    for (var i = 0; i < linesRanges.length; i++) {
        var range = linesRanges[i];
        if (typeof range === 'number') {
            insert(range);
        }
        else {
            for (var j = range.start; j <= range.end; j++) {
                insert(j);
            }
        }
    }
    return result.sort();
    function insert(lineNumber) {
        if (result.indexOf(lineNumber) === -1 && lineNumber > 0 && lineNumber <= lineCount) {
            result.push(lineNumber);
        }
    }
}
function isChecked(browser, selector) {
    return new Promise(function (resolve) {
        browser.getAttribute(selector, 'checked', function (result) {
            if (result.value === 'true') {
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    });
}
function toggleCheckbox(browser, selector, checked) {
    var _this = this;
    return new Promise(function (resolve) { return __awaiter(_this, void 0, void 0, function () {
        var currentChecked;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, isChecked(browser, selector)];
                case 1:
                    currentChecked = _a.sent();
                    if (currentChecked === checked) {
                        resolve();
                    }
                    else {
                        browser.click(selector, function () {
                            resolve();
                        });
                    }
                    return [2 /*return*/];
            }
        });
    }); });
}
function getElements(browser, selector) {
    return new Promise(function (resolve) {
        browser.elements('css selector', selector, function (result) {
            resolve(result.value);
        });
    });
}
function getTextFromElementId(browser, elementId) {
    return new Promise(function (resolve) {
        browser.elementIdText(elementId, function (result) {
            resolve(result.value);
        });
    });
}
function getValue(browser, selector) {
    return new Promise(function (resolve) {
        browser.getValue(selector, function (result) {
            resolve(result.value);
        });
    });
}
function getText(browser, selector) {
    return new Promise(function (resolve) {
        browser.getText(selector, function (result) {
            resolve(result.value);
        });
    });
}
function setChunkSize(size, browser) {
    browser
        .clearValue('#chunk-size-input')
        .setValue('#chunk-size-input', size.toString())
        .click('#set-chunk-btn')
        .waitForElementNotPresent('.status.running', 10000);
    browser.expect.element('#console .error').not.to.be.present;
    browser.expect.element('#console .normal:last-child').text.to.be.equal("Chunk size is set to " + size.toString());
}
function resetChunkSize(browser) {
    browser.click('#reset-chunk-btn')
        .waitForElementNotPresent('.status.running', 10000);
    browser.expect.element('#console .error').not.to.be.present;
}
function testLoadFile(testFile, browser, doIterate) {
    if (doIterate === void 0) { doIterate = false; }
    doIterate = false;
    var filename = path.resolve(testFile.filePath);
    browser.setValue('#file-input', filename)
        .click('#loadFile');
    if (doIterate) {
        browser.click('#iterate-action option[value="1"]');
    }
    browser.click('#execute')
        .waitForElementNotPresent('.status.running', 10000);
    browser.expect.element('#console .error').not.to.be.present;
    browser.expect.element('.line-count span').text.to.be.equal(testFile.lines.length.toString());
    if (doIterate) {
        browser.expect.element('#console .normal:last-child').text.to.be.equal("iterate count: " + testFile.lines.length);
    }
}
