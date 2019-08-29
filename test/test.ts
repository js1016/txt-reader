import { NightwatchAPI } from "nightwatch";

module.exports = {
    'Navigate to http://localhost:8081': function (browser: NightwatchAPI) {
        browser
            .url('http://localhost:8081/')
    },
    'Step 2': function (browser: NightwatchAPI) {
        browser.end();
    }
}