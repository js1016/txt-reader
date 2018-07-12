const TxtReader = require('./../txt-reader.js').TxtReader;
var reader = new TxtReader();
var file;
reader.loadFile(file)
    .progress(progress => {
        alert(progress);
    })
    .then(response => {
        var a = response.result.lineCount;
        var b = response.result.scope;
    });

reader.getLines(1, 2)
    .progress(progress => {
        alert(progress);
    })
    .then(response => {
        var a = response.result[0];
    })

reader.iterateLines({
    eachLine: function (a, b, c) {

    },
    scope: {}
})
    .then(response => {
        var a = response.result;
    })