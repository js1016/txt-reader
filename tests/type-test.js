const TxtReader = require('./../txt-reader.js').TxtReader;
var reader = new TxtReader();
var file;

reader.sniffLines(file, 5)
    .progress(function (progress) {
        console.log('Sniffing lines progress: ' + progress + '%');
    })
    .then(function (response) {
        console.log('The first five lines are: ', response.result);
    })
    .catch(function (reason) {
        console.log('sniffLines failed with error: ' + reason);
    });
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