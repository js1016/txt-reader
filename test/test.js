module.exports = {
    'Demo test': function (browser) {
        browser
            .url('http://localhost:8081/')
            .end();
    }
}