import { TxtReader } from '../txt-reader'
var a = new TxtReader();
let file!: File;
a.sniffLines(file, 200)
    .progress(progress => {
        console.log(progress);
    })
    .then(resposne => {
        resposne.result
    })
a.loadFile(file, {
    eachLine: function (raw) {
        this.decode(raw);
    },
    scope: {
    }
});
a.getSporadicLines([1, 2, 3, { start: 1, end: 2 }])
    .progress(progress => {
        console.log(progress);
    })
    .then(response => {
        response.result[1]
    });
a.iterateSporadicLines({
    eachLine: function (raw, progress, lineNumber) {

    },
    scope: {}
}, [1, 2, 3, 4])
    .then(response => {
        response.result;
    })
a.loadFile(file).then(response => {

})
a.getSporadicLines([1, 2, 3, 4, { start: 1, end: 2 }])
    .progress(progress => {

    })
    .then(response => {
    })
a.iterateSporadicLines({
    eachLine: function (raw, progress, lineNumber) {

    },
    scope: {}
}, [1, 2, 3, 4, { start: 1, end: 1 }]);

a.getLines(1, 20).then(response => {
})
a.iterateLines({
    eachLine: function (a, b, c) {
        this.decode(a)
    },
    scope: {

    }
}, 1, 10).then(response => {
    response.result
});