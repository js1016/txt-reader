import { NightwatchAPI } from "nightwatch";
import * as lineReader from "line-reader";
import * as path from "path";
import { promises } from "fs";

class TestFile {
    filePath: string;
    lines: string[] = [];
    constructor(fileName: string, cb: () => void) {
        this.filePath = `${__dirname}/samples/${fileName}`;
        lineReader.eachLine(this.filePath, (line, last) => {
            this.lines.push(line);
            if (last) {
                cb();
            }
        })
    }
}

let testFiles: TestFile[] = [];

module.exports = {
    before: function (browser: NightwatchAPI, done: () => void) {
        testFiles.push(new TestFile('mixed-eol-6-lines.txt', function () {
            testFiles.push(new TestFile('CBS.log', function () {
                done();
            }));
        }));
    },
    after: function (browser: NightwatchAPI) {
        //browser.end();
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
    'Test mixed-eol-6-lines.txt': function (browser: NightwatchAPI) {
        setChunkSize(1, browser);
        testLoadFile(testFiles[0], browser);
        testLoadFile(testFiles[0], browser, true);
        browser.click('#getLines');
        for (let i = 1; i <= testFiles[0].lines.length; i++) {
            browser
                .clearValue('#start')
                .setValue('#start', i.toString())
                .clearValue('#count')
                .setValue('#count', '1')
                .click('#execute')
                .waitForElementNotPresent('.status.running', 10000);
            verifyGetResult(testFiles[0], browser);
        }
    }
}

async function verifyGetResult(testFile: TestFile, browser: NightwatchAPI) {
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
        let outputs = await getElements(browser, '#console .echo');
        outputs.forEach(async item => {
            let text = await getTextFromElementId(browser, item.ELEMENT);
            browser.expect(true).to.be.false;
            debugger;
        })
    }
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
        browser.expect.element('#console .normal:last-child').text.to.be.equal(`iterate count: ${testFiles[0].lines.length}`);
    }
}