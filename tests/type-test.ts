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
a.loadFile(file).then(response => {

})

a.getLines([1],false).then(response => {
    
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