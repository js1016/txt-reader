let path = require('path');

module.exports = {
    'TxtReader testing': function (browser) {
        browser
            .url(path.resolve(__dirname + '/dist/index.html'))
            .waitForElementVisible('#file-input', 1000);
        let samples = require('./samples/samples.json');
        samples.forEach(sample => {
            testFile(sample);
        });
        function testFile(sample) {
            let fileName = path.resolve(__dirname + '/samples/' + sample.file);
            let expectLineCount = sample.lineCount;
            browser
                .setValue('#file-input', fileName);
            testLoad();
            testLineCount(expectLineCount);
            if (sample.getLines) {
                testGetAndIterateLines(sample.getLines);
            }
            if (sample.chunkSizeTest && sample.chunkSizeTest.length > 0) {
                sample.chunkSizeTest.forEach(chunkSize => {
                    setChunkSize(chunkSize);
                    testLoad();
                    testLineCount(expectLineCount);
                    if (sample.getLines) {
                        testGetAndIterateLines(sample.getLines);
                    }
                });
            }
            setChunkSize(1024 * 1024 * 50);
        }
        function testLoad() {
            browser
                .click('#load-file')
                .waitForElementNotVisible('#running', 60000);
            browser.expect.element('#console>.error').to.not.be.present;
            browser.expect.element('#console>.success').to.be.present;
        }
        function testLineCount(expectLineCount) {
            browser
                .click('#clear-console')
                .waitForElementNotPresent('#console>.success', 1000)
                .click('#get-line-count')
                .waitForElementVisible('#console>.success', 1000);
            browser.expect.element('#console>.success').text.to.equal(expectLineCount.toString());
        }
        function setChunkSize(chunkSize) {
            browser
                .click('#clear-console')
                .waitForElementNotPresent('#console>.success', 1000)
                .clearValue('#chunk-size')
                .setValue('#chunk-size', chunkSize)
                .click('#set-chunk-size')
                .waitForElementNotVisible('#running', 60000);
            browser.expect.element('#console>.error').to.not.be.present;
            browser.expect.element('#console>.success').to.be.present;
        }
        function testGetAndIterateLines(getLines) {
            for (let i = 0; i < getLines.length; i++) {
                let lineNumber = getLines[i].line;
                let content = getLines[i].content;
                test(lineNumber, 1, content, content, false);
                test(lineNumber, 1, content, content, true);
            }
            let first = getLines[0];
            let last = getLines[getLines.length - 1];
            if (last.line > first.line) {
                test(first.line, last.line - first.line + 1, first.content, last.content, false);
                test(first.line, last.line - first.line + 1, first.content, last.content, true);
            }
            function test(start, count, first, last, isIterate) {
                browser
                    .click('#clear-console')
                    .waitForElementNotPresent('#console>.success', 1000)
                    .clearValue('#start-line')
                    .clearValue('#count')
                    .setValue('#start-line', start)
                    .setValue('#count', count)
                    .click(isIterate ? '#iterate-lines' : '#get-lines')
                    .waitForElementNotVisible('#running', 60000);
                browser.expect.element('#console>.error').to.not.be.present;
                browser.expect.element('#console>.success').text.to.equal('First line: ' + first);
                browser.expect.element('#console>.success + .success').text.to.equal('Last line: ' + last);
            }
        }
    },
    after: function (browser) {
        browser.end();
    }
};