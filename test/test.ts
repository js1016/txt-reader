import { NightwatchAPI } from "nightwatch";
import * as lineReader from "line-reader";
import * as path from "path";

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
        let fileName = path.resolve(testFiles[0].filePath);
        browser.setValue('#file-input', fileName)
            .click('#execute')
            .waitForElementNotPresent('.status.running', 10000);
        browser.expect.element('#console .error').not.to.be.present;
        browser.expect.element('.line-count span').text.to.be.equal(testFiles[0].lines.length.toString());
        browser.setValue('#iterate-action', '1')
            .click('#execute')
            .waitForElementNotPresent('.status.running', 10000);
        browser.expect.element('#console .error').not.to.be.present;
        browser.expect.element('.line-count span').text.to.be.equal(testFiles[0].lines.length.toString());
        browser.expect.element('#console .normal:last').text.to.be.equal(`iterate count: ${testFiles[0].lines.length}`);
    }
}