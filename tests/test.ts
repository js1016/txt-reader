import { NightwatchAPI } from "nightwatch";
import * as lineReader from "line-reader";
import * as path from "path";
import * as chai from "chai";
import { TextDecoder } from "util";
import { LinesRange, LinesRanges } from "../txt-reader-common";

class TestFile {
    filePath: string;
    lines: string[] = [];
    constructor(fileName: string, cb: () => void) {
        this.filePath = `${__dirname}/samples/${fileName}`;
        lineReader.eachLine(this.filePath, (line, last) => {
            this.lines.push(line);
            if (this.lines.length === 1 && this.lines[0].charCodeAt(0) === 65279) {
                this.lines[0] = this.lines[0].substr(1);
            }
            if (last) {
                cb();
            }
        });
    }
}

let testFiles: TestFile[] = [];
let decoder = new TextDecoder('utf-8');
let currentMethod: string = '';

module.exports = {
    before: function (browser: NightwatchAPI, done: () => void) {
        testFiles.push(new TestFile('mixed-eol-6-lines.txt', function () {
            testFiles.push(new TestFile('CBS.log', function () {
                done();
            }));
        }));
    },
    after: function (browser: NightwatchAPI) {
        browser.end();
    },
    'Navigate to http://localhost:8081': function (browser: NightwatchAPI) {
        browser.url('http://localhost:8081/')
            .waitForElementVisible('#file-input', 2000);
    },
    'Test empty loadFile': function (browser: NightwatchAPI) {
        browser.click('#execute')
            .waitForElementNotPresent('.status.running', 10000);
        browser.expect.element('#console .error').to.be.present;
    },
    'Test mixed-eol-6-lines.txt': async function (browser: NightwatchAPI) {
        let testFile = testFiles[0];
        setChunkSize(1, browser);
        // for (let i = 1; i <= testFile.lines.length + 1; i++) {
        //     testSniffFile(testFile, browser, i);
        // }
        // testSniffFile(testFile, browser, testFile.lines.length, false);
        // testSniffFile(testFile, browser, 0);
        testLoadFile(testFile, browser);
        testLoadFile(testFile, browser, true);
        for (let i = 1; i <= testFile.lines.length; i++) {
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
        // for (let i = 1; i <= testFile.lines.length; i++) {
        //     testGetSporadicLines(browser, testFile, i);
        //     testIterateSporadicLines(browser, testFile, i);
        // }
        // testGetSporadicLines(browser, testFile, Math.ceil(testFile.lines.length / 2), false);
        // testIterateSporadicLines(browser, testFile, Math.ceil(testFile.lines.length / 2));
    },
    'Test CBS.log': function (browser: NightwatchAPI) {
        resetChunkSize(browser);
        let testFile = testFiles[1];
        //testSniffFile(testFile, browser, 1000);
        testLoadFile(testFiles[1], browser, true);
        for (let i = 1; i <= testFile.lines.length; i += 10000) {
            testGetLines(browser, testFile, i, 10000);
        }
        testGetLinesMultiple(browser, testFile, 10);
        testGetLinesMultiple(browser, testFile, 100);
        testGetLinesMultiple(browser, testFile, 1000);
        testGetLinesMultiple(browser, testFile, 10000);
        testGetLinesMultiple(browser, testFile, 20000);
        testGetLinesMultiple(browser, testFile, 30000);
        testGetLinesMultiple(browser, testFile, 300000);
        // for (let i = 1; i <= testFile.lines.length; i += 5000) {
        //     testIterateLines(browser, testFile, i, 5000);
        // }
        // testGetSporadicLines(browser, testFile, Math.ceil(testFile.lines.length / 2));
        // testIterateSporadicLines(browser, testFile, Math.ceil(testFile.lines.length / 2));
    }
}

async function testIterateLines(browser: NightwatchAPI, testFile: TestFile, start: number, count: number) {
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
    } else {
        let expectStart = start;
        if (start < 1) {
            expectStart = 1;
        }
        let expectEnd = start + count - 1;
        if (expectEnd > testFile.lines.length) {
            expectEnd = testFile.lines.length;
        }
        verifyIterateResult(browser, testFile, expectStart, expectEnd);
    }
}

function getStart(item: LinesRange | number): number {
    if (typeof item === 'number') {
        return item;
    } else {
        return item.start;
    }
}

function getEnd(item: LinesRange | number): number {
    return typeof item === 'number' ? item : item.end;
}

async function testIterateSporadicLines(browser: NightwatchAPI, testFile: TestFile, lineCount: number) {
    browser.click('#iterateSporadicLines', function () {
        currentMethod = 'iterateSporadicLines';
    })
        .clearValue('#sporadic-line-count')
        .setValue('#sporadic-line-count', lineCount.toString())
        .click('#iterate-action option[value="2"]')
    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
    let map = JSON.parse(await getValue(browser, '#sporadic-lines-map')) as (LinesRange | number)[];
    let expectStart = getStart(map[0]);
    let expectEnd = getEnd(map[map.length - 1]);
    if (expectStart < 1) {
        expectStart = 0;
    }
    if (expectEnd > testFile.lines.length) {
        expectEnd = testFile.lines.length;
    }
    verifyIterateResult(browser, testFile, expectStart, expectEnd);
}

async function verifyIterateResult(browser: NightwatchAPI, testFile: TestFile, expectStart: number, expectEnd: number) {
    let firstLineRegExp = /^First line \((\d+)\): (.+)?$/;
    let lastLineRegExp = /^Last line \((\d+)\): (.+)?$/;
    let echoElements = await getElements(browser, '#console .echo');
    echoElements.forEach(async echoElement => {
        let text = await getTextFromElementId(browser, echoElement.ELEMENT);
        let isFirst = text.startsWith('First');
        let regexp = isFirst ? firstLineRegExp : lastLineRegExp;
        let match = regexp.exec(text);
        chai.expect(match).not.to.be.null;
        if (match) {
            let lineNumber = Number(match[1]);
            if (isFirst) {
                chai.expect(lineNumber, `First line number should be ${expectStart}`).to.be.equal(expectStart);
            } else {
                chai.expect(lineNumber, `Last line number should be ${expectEnd}`).to.be.equal(expectEnd);
            }
            let content = match[2];
            let expectContent = testFile.lines[lineNumber - 1];
            chai.expect(content, `Line ${lineNumber} should be: ${expectContent}`).to.be.equal(expectContent);
        }
    });
}

async function testGetSporadicLines(browser: NightwatchAPI, testFile: TestFile, lineCount: number, decode: boolean = true) {
    browser.click('#getSporadicLines', function () {
        currentMethod = 'getSporadicLines';
    })
        .clearValue('#sporadic-line-count')
        .setValue('#sporadic-line-count', lineCount.toString());
    await toggleCheckbox(browser, '#decode-checkbox', decode);
    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
    verifyGetResult(testFile, browser);
}

async function testGetLinesMultiple(browser: NightwatchAPI, testFile: TestFile, lineNumber: number, decode: boolean = true) {
    browser.click('#getLines', function () {
        currentMethod = 'getLines';
    })
        .clearValue('#autogen-linenumber')
        .setValue('#autogen-linenumber', lineNumber.toString());
    _testGetLines(browser, testFile, decode);
}

async function _testGetLines(browser: NightwatchAPI, testFile: TestFile, decode: boolean = true) {
    await toggleCheckbox(browser, '#decode-checkbox', decode);
    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
    verifyGetResult(testFile, browser);
}

async function testGetLines(browser: NightwatchAPI, testFile: TestFile, start: number, count: number, decode: boolean = true) {
    let linesRangesJSONstring = count === 1 ? `[${start}]` : `[{"start":${start},"end":${start + count - 1}}]`;
    browser.click('#getLines', function () {
        currentMethod = 'getLines';
    });
    await toggleCheckbox(browser, '#sporadic-customize', true);
    browser.clearValue('#lines-ranges')
        .setValue('#lines-ranges', linesRangesJSONstring);
    _testGetLines(browser, testFile, decode);
}

async function testSniffFile(testFile: TestFile, browser: NightwatchAPI, sniffCount: number, decode: boolean = true) {
    let filename = path.resolve(testFile.filePath);
    browser.setValue('#file-input', filename)
        .click('#sniffLines', function () {
            currentMethod = 'sniffLines'
        })
        .clearValue('#line-number-input')
        .setValue('#line-number-input', sniffCount.toString());
    await toggleCheckbox(browser, '#decode-checkbox', decode);
    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
    if (sniffCount < 1) {
        browser.expect.element('#console .error').to.be.present;
    } else {
        verifyGetResult(testFile, browser);
    }
}

async function verifyGetResult(testFile: TestFile, browser: NightwatchAPI) {
    let decode = await isChecked(browser, '#decode-checkbox');
    let matchReg = /^(\d+): (.+)?$/;
    let expectResultCount: number = 0;
    if (currentMethod === 'getLines') {
        let linesRanges = JSON.parse(await getValue(browser, '#lines-ranges')) as LinesRanges;
        let lines = processLinesRanges(linesRanges, testFile.lines.length);
        expectResultCount = lines.length;
    } else if (currentMethod === 'getSporadicLines') {
        let lineCount: number = Number(await getValue(browser, '#sporadic-line-count'));
        expectResultCount = lineCount;
        if (lineCount > testFile.lines.length) {
            expectResultCount = testFile.lines.length;
        }
    } else if (currentMethod === 'sniffLines') {
        let sniffCount: number = Number(await getValue(browser, '#line-number-input'));
        expectResultCount = sniffCount;
        if (expectResultCount > testFile.lines.length) {
            expectResultCount = testFile.lines.length;
        }
    }
    if (expectResultCount === 0) {
        browser.expect.element('#console .error').to.be.present;
    } else {
        browser.expect.element('#result-count').text.to.be.equal(expectResultCount.toString());
        let pageCount: number = Number(await getText(browser, '#page-count'));
        for (let i = 1; i <= pageCount; i++) {
            browser
                .clearValue('#page-number')
                .setValue('#page-number', i.toString())
                .click('#go')
                .waitForElementPresent('#console .echo', 1000);
            let all = await getText(browser, '#console');
            let outputs = all.split('\n');
            outputs.forEach(item => {
                let match = matchReg.exec(item);
                chai.expect(match).not.to.be.null;
                if (match) {
                    let lineNumber = Number(match[1]);
                    let content = match[2] ? match[2] : '';
                    if (!decode && content.length > 0) {
                        let outputArr = new Uint8Array(content.split(',').map(function (i) {
                            return Number(i);
                        }));
                        content = decoder.decode(outputArr);
                    }
                    let expectContent = testFile.lines[lineNumber - 1];
                    chai.expect(content, `Line ${lineNumber} should be: ${expectContent}`).to.be.equal(expectContent);
                }
            });
        }
    }
}

function processLinesRanges(linesRanges: LinesRanges, lineCount: number): number[] {
    let result: number[] = [];
    for (let i = 0; i < linesRanges.length; i++) {
        let range = linesRanges[i];
        if (typeof range === 'number') {
            insert(range);
        } else {
            for (let j = range.start; j <= range.end; j++) {
                insert(j);
            }
        }
    }
    return result.sort();
    function insert(lineNumber: number) {
        if (result.indexOf(lineNumber) === -1 && lineNumber > 0 && lineNumber <= lineCount) {
            result.push(lineNumber);
        }
    }
}

function isChecked(browser: NightwatchAPI, selector: string): Promise<boolean> {
    return new Promise(resolve => {
        browser.getAttribute(selector, 'checked', function (result) {
            if (result.value === 'true') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

function toggleCheckbox(browser: NightwatchAPI, selector: string, checked: boolean): Promise<undefined> {
    return new Promise(async resolve => {
        let currentChecked = await isChecked(browser, selector);
        if (currentChecked === checked) {
            resolve();
        } else {
            browser.click(selector, function () {
                resolve();
            });
        }
    });
}

function getElements(browser: NightwatchAPI, selector: string): Promise<{ ELEMENT: string }[]> {
    return new Promise(resolve => {
        browser.elements('css selector', selector, function (result) {
            resolve(result.value as { ELEMENT: string }[]);
        });
    });
}

function getTextFromElementId(browser: NightwatchAPI, elementId: string): Promise<string> {
    return new Promise(resolve => {
        browser.elementIdText(elementId, function (result) {
            resolve(result.value as string);
        });
    });
}

function getValue(browser: NightwatchAPI, selector: string): Promise<string> {
    return new Promise(resolve => {
        browser.getValue(selector, function (result) {
            resolve(result.value as string);
        });
    });
}

function getText(browser: NightwatchAPI, selector: string): Promise<string> {
    return new Promise(resolve => {
        browser.getText(selector, function (result) {
            resolve(result.value as string);
        });
    });
}

function setChunkSize(size: number, browser: NightwatchAPI) {
    browser
        .clearValue('#chunk-size-input')
        .setValue('#chunk-size-input', size.toString())
        .click('#set-chunk-btn')
        .waitForElementNotPresent('.status.running', 10000);
    browser.expect.element('#console .error').not.to.be.present;
    browser.expect.element('#console .normal:last-child').text.to.be.equal(`Chunk size is set to ${size.toString()}`);
}

function resetChunkSize(browser: NightwatchAPI) {
    browser.click('#reset-chunk-btn')
        .waitForElementNotPresent('.status.running', 10000);
    browser.expect.element('#console .error').not.to.be.present;
}

function testLoadFile(testFile: TestFile, browser: NightwatchAPI, doIterate: boolean = false) {
    doIterate = false;
    let filename = path.resolve(testFile.filePath);
    browser.setValue('#file-input', filename)
        .click('#loadFile');
    if (doIterate) {
        browser.click('#iterate-action option[value="1"]')
    }
    browser.click('#execute')
        .waitForElementNotPresent('.status.running', 10000);
    browser.expect.element('#console .error').not.to.be.present;
    browser.expect.element('.line-count span').text.to.be.equal(testFile.lines.length.toString());
    if (doIterate) {
        browser.expect.element('#console .normal:last-child').text.to.be.equal(`iterate count: ${testFile.lines.length}`);
    }
}