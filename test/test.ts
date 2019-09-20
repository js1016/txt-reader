import { NightwatchAPI } from "nightwatch";
import * as lineReader from "line-reader";
import * as path from "path";
import * as chai from "chai";
import { TextDecoder } from "util";

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
        testLoadFile(testFile, browser);
        testLoadFile(testFile, browser, true);
        for (let i = 1; i <= testFile.lines.length; i++) {
            testGetLines(browser, testFile, i, 1);
        }
        testGetLines(browser, testFile, 1, testFile.lines.length + 1, false);
        testGetLines(browser, testFile, testFile.lines.length + 1, 1, false);
        testGetLines(browser, testFile, 0, 1, false);
    },
    'Test CBS.log': function (browser: NightwatchAPI) {
        resetChunkSize(browser);
        let testFile = testFiles[1];
        testLoadFile(testFiles[1], browser, true);
        for (let i = 1; i <= testFile.lines.length; i += 9999) {
            testGetLines(browser, testFile, i, 10000, false);
        }
    }
}

async function testGetSporadicLines(browser: NightwatchAPI, testFile: TestFile, lineCount: number, decode: boolean = true) {
    browser.click('#getSporadicLines')
        .clearValue('#sporadic-line-count')
        .setValue('#sporadic-line-count', lineCount.toString())
        //.pause()
}

async function testGetLines(browser: NightwatchAPI, testFile: TestFile, start: number, count: number, decode: boolean = true) {
    browser.click('#getLines')
        .clearValue('#start')
        .setValue('#start', start.toString())
        .clearValue('#count')
        .setValue('#count', count.toString());
    await toggleCheckbox(browser, '#decode-checkbox', decode);
    browser.click('#execute').waitForElementNotPresent('.status.running', 10000);
    if (start > testFile.lines.length || start < 1) {
        browser.expect.element('#console .error').to.be.present;
    } else {
        verifyGetResult(testFile, browser);
    }
}

async function verifyGetResult(testFile: TestFile, browser: NightwatchAPI) {
    let decode = await isChecked(browser, '#decode-checkbox');
    let matchReg = /^(\d+): (.+)?$/
    let start: number = Number(await getValue(browser, '#start'));
    let count: number = Number(await getValue(browser, '#count'));
    let expectResultCount: number = count;
    if (start + count - 1 > testFile.lines.length) {
        expectResultCount = testFile.lines.length - start + 1;
    }
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
                if (lineNumber === 99) {
                    debugger;
                }
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
        // browser.getAttribute(selector, 'checked', function (result) {
        //     if ((checked === true && result.value === 'true') || (checked === false && result.value === null)) {
        //         browser.click(selector, function () {
        //             resolve();
        //         });
        //     } else {
        //     }
        // });
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