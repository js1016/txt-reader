import { TxtReader } from '../txt-reader'
var a = new TxtReader();
let file!: File;
a.loadFile(file, {
    eachLine: function (raw) {
        this.decode(raw)
    },
    scope: {
    }
})
a.loadFile(file).then(response => {

})
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