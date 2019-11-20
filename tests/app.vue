<template>
    <div id="app">
        <div id="status-bar">
            <input type="file" id="file-input" v-on:change="fileChange" />
            <div class="line-count">
                Line count:
                <span>{{lineCount}}</span>
            </div>
            <div
                class="status"
                v-bind:class="{running:running}"
            >Status: {{running?'Running':'Idle'}}</div>
            <div class="progress">Progress: {{running?progress:'N/A'}}</div>
            <input type="number" id="chunk-size-input" v-model="chunkSizeValue" />
            <button @click="setChunkSize" id="set-chunk-btn">Set Chunk Size</button>
            <button @click="resetChunk" id="reset-chunk-btn">Reset Chunk Size</button>
        </div>
        <div id="methods">
            <template v-for="(value, name) in methods">
                <input type="radio" :id="name" :value="name" v-model="activeMethodName" />
                <label :for="name">{{value.signature}}</label>
            </template>
        </div>
        <div id="configs">
            <div v-if="activeMethod.hasStartCount" id="start-count">
                <span>Start:</span>
                <input type="number" id="start" v-model="startValue" />
                <span>Count:</span>
                <input type="number" id="count" v-model="countValue" />
            </div>
            <div v-if="activeMethod.hasDecode" id="decode">
                <label for="decode-checkbox">Decode:</label>
                <input type="checkbox" v-model="decode" id="decode-checkbox" />
            </div>
            <div v-if="activeMethod.iteratable">
                <span>Iterate action:</span>
                <select v-model="iterateOption" id="iterate-action">
                    <option value="0" v-if="activeMethodName==='loadFile'">None</option>
                    <option value="1">Iterate count</option>
                    <option
                        value="2"
                        v-if="activeMethodName!=='loadFile'"
                    >Get first line and last line</option>
                </select>
            </div>
            <div v-if="activeMethod.acceptsLinesRanges">
                <div>
                    <span>Auto generate linesRanges by lineNumber:</span>
                    <input type="number" v-model="autoGenerateLineNumberStr" />
                    <span>lines</span>
                </div>
                <div>
                    <span>linesRanges:</span>
                    <textarea
                        id="lines-ranges"
                        :disabled="!customizedLinesRanges"
                        v-model="linesRangesString"
                        v-on:change="linesRangesChange"
                    ></textarea>
                    <input type="checkbox" v-model="customizedLinesRanges" id="sporadic-customize" />
                    <label for="sporadic-customize">Customize</label>
                    <input type="file" id="map-file-input" v-on:change="mapFileChange" />
                </div>
            </div>
            <div v-if="activeMethod.hasLineNumber">
                <span>Line Number:</span>
                <input type="number" v-model="lineNumberValue" id="line-number-input" />
            </div>
        </div>
        <div id="button">
            <button id="execute" @click="execute">Execute</button>
            <button id="clear-console" @click="clearConsole">Clear Console</button>
            <template v-if="getResults.length>0">
                <span>
                    Get result count:
                    <span id="result-count">{{getResults.length}}</span>
                </span>
                <button @click="prev" id="prev">&lt;</button>
                <input
                    type="number"
                    id="page-number"
                    min="1"
                    v-bind:max="this.pageCount"
                    v-model="pageNumberValue"
                /> /
                <span id="page-count">{{this.pageCount}}</span>
                <button @click="next" id="next">&gt;</button>
                <button @click="go" id="go">Go</button>
            </template>
        </div>
        <div id="console">
            <div v-for="message in messages" :class="message.type">{{message.content}}</div>
        </div>
    </div>
</template>

<script lang="ts">
import * as json5 from "json5";
import Vue from "vue";
import { Component, Prop, Watch } from "vue-property-decorator";
import { TxtReader, IIteratorConfig } from "../txt-reader";
import { LinesRange } from "../txt-reader-common";
import { IIteratorConfigMessage, LinesRanges } from "../txt-reader-common";

let txtReader = window.txtReader;
type Methods = {
    loadFile: MethodConfig;
    getLines: MethodConfig;
    getLines2: MethodConfig;
    getSporadicLines: MethodConfig;
    iterateLines: MethodConfig;
    iterateSporadicLines: MethodConfig;
    sniffLines: MethodConfig;
    [index: string]: MethodConfig;
};

interface MethodConfig {
    signature: string;
    hasStartCount: boolean;
    iteratable: boolean;
    acceptsLinesRanges: boolean;
    hasDecode: boolean;
    hasLineNumber: boolean;
}

type Message = {
    content: string;
    type: string;
};

type GetResults = { lineNumber: number; value: string }[];

function getPlainRanges(
    ranges: LinesRanges,
    min?: number,
    max?: number
): number[] {
    let result: number[] = [];
    for (let i = 0; i < ranges.length; i++) {
        let current = ranges[i];
        if (typeof current === "number") {
            if (result.indexOf(current) === -1) {
                push(current);
            }
        } else {
            for (let j = current.start; j <= current.end; j++) {
                if (result.indexOf(j) === -1) {
                    push(j);
                }
            }
        }
    }
    function push(number: number) {
        if (
            typeof min === "number" &&
            typeof max === "number" &&
            number >= min &&
            number <= max
        ) {
            result.push(number);
        } else if (typeof min === "undefined" || typeof max === "undefined") {
            result.push(number);
        }
    }
    return result;
}

@Component
export default class App extends Vue {
    chunkSizeValue: string = "104857600";
    pageSize: number = 1000;
    getResults: GetResults = [];
    isFileLoaded: boolean = false;
    autoGenerateLineNumberStr: string = "";
    pageNumberValue: string = "1";
    linesRangesString: string = "";
    customizedLinesRanges: boolean = false;
    linesRanges: LinesRanges = [];
    iterateOption: string = "0";
    decode: boolean = true;
    startValue: string = "";
    lineNumberValue: string = "";
    countValue: string = "";
    lineCount: number = txtReader.lineCount;
    file!: File;
    mapFile!: File;
    running: boolean = false;
    progress: number = 0;
    activeMethodName: string = "loadFile";
    messages: Message[] = [];
    methods: Methods = {
        loadFile: {
            signature: "loadFile(file[ ,iteratorConfig])",
            hasStartCount: false,
            iteratable: true,
            acceptsLinesRanges: false,
            hasDecode: false,
            hasLineNumber: false
        },
        testRanges: {
            signature: "_testRanges(linesRanges)",
            hasStartCount: false,
            iteratable: false,
            acceptsLinesRanges: true,
            hasDecode: false,
            hasLineNumber: false
        },
        getLines2: {
            signature: "getLines2(linesRanges[, decode])",
            hasStartCount: false,
            iteratable: false,
            acceptsLinesRanges: true,
            hasDecode: true,
            hasLineNumber: false
        },
        getLines: {
            signature: "getLines(start, count[, decode])",
            hasStartCount: true,
            iteratable: false,
            acceptsLinesRanges: false,
            hasDecode: true,
            hasLineNumber: false
        },
        getSporadicLines: {
            signature: "getSporadicLines(sporadicLinesMap[, decode])",
            hasStartCount: false,
            iteratable: false,
            acceptsLinesRanges: true,
            hasDecode: true,
            hasLineNumber: false
        },
        iterateLines: {
            signature: "iterateLines(iteratorConfig[, start, count])",
            hasStartCount: true,
            iteratable: true,
            acceptsLinesRanges: false,
            hasDecode: false,
            hasLineNumber: false
        },
        iterateSporadicLines: {
            signature: "iterateSporadicLines(iteratorConfig, sporadicLinesMap)",
            hasStartCount: false,
            iteratable: true,
            acceptsLinesRanges: true,
            hasDecode: false,
            hasLineNumber: false
        },
        sniffLines: {
            signature: "sniffLines(file, lineNumber[, decode])",
            hasStartCount: false,
            iteratable: false,
            acceptsLinesRanges: false,
            hasDecode: true,
            hasLineNumber: true
        }
    };

    get chunkSize(): number {
        return Number(this.chunkSizeValue);
    }

    get pageNumber(): number {
        return Number(this.pageNumberValue);
    }

    get pageCount(): number {
        return Math.ceil(this.getResults.length / this.pageSize);
    }

    get activeMethod(): MethodConfig {
        return this.methods[this.activeMethodName];
    }

    get start(): number {
        return Number(this.startValue);
    }

    get count(): number {
        return Number(this.countValue);
    }

    get lineNumber(): number {
        return Number(this.lineNumberValue);
    }

    get autoGenerateLineNumber(): number {
        return Number(this.autoGenerateLineNumberStr);
    }

    @Watch("getResults")
    onGetResultsChange(results: GetResults) {
        if (results.length > 0) {
            this.pageNumberValue = "1";
        }
    }

    @Watch("activeMethodName")
    onMethodChange(methodName: string, oldMethodName: string) {
        if (methodName === "loadFile") {
            this.iterateOption = "0";
        }
        if (oldMethodName === "loadFile") {
            this.iterateOption = "1";
        }
    }

    @Watch("linesRangesString")
    onLinesRangesStringChange(value: string) {
        if (this.customizedLinesRanges) {
            try {
                this.linesRanges = json5.parse(value);
            } catch {}
        }
    }

    @Watch("autoGenerateLineNumber")
    onAutoGenerateLineNumberChange(count: number) {
        this.customizedLinesRanges = false;
        this.linesRanges = [];
        if (count >= txtReader.lineCount || count <= 0) {
            this.linesRanges.push({
                start: 1,
                end: txtReader.lineCount
            });
        } else {
            if (count <= 10000) {
                let paraNumber = count + 1;
                let each = txtReader.lineCount / paraNumber;
                for (let i = 0; i < count; i++) {
                    let lineNumber = Math.floor((i + 1) * each);
                    if (lineNumber > txtReader.lineCount) {
                        lineNumber = txtReader.lineCount;
                    } else if (lineNumber < 1) {
                        lineNumber = 1;
                    }
                    this.linesRanges.push(lineNumber);
                }
            } else {
                let maxPerBlock = Math.floor(txtReader.lineCount / 10000);
                let perBlockLength = Math.floor(count / 10000);
                for (let i = 0; i < 10000; i++) {
                    let start = i * maxPerBlock + 1;
                    this.linesRanges.push({
                        start: start,
                        end: start + perBlockLength - 1
                    });
                }
                let rest = count - perBlockLength * 10000;
                if (rest) {
                    for (let i = 0; i < this.linesRanges.length; i++) {
                        let current = this.linesRanges[i] as LinesRange;
                        let nextStart =
                            i < this.linesRanges.length - 1
                                ? (this.linesRanges[i + 1] as LinesRange).start
                                : txtReader.lineCount + 1;
                        if ((current.end as number) < nextStart - 1) {
                            if (i < this.linesRanges.length - 1) {
                                (current.end as number)++;
                                rest--;
                                if (rest === 0) {
                                    break;
                                }
                            } else {
                                let tryEnd = (current.end as number) + rest;
                                current.end =
                                    tryEnd > txtReader.lineCount
                                        ? txtReader.lineCount
                                        : tryEnd;
                            }
                        }
                    }
                }
            }
        }
        this.linesRangesString = JSON.stringify(this.linesRanges);
    }

    prev() {
        let prevNumber = this.pageNumber - 1;
        if (prevNumber === 0) {
            this.pageNumberValue = this.pageCount.toString();
        } else {
            this.pageNumberValue = prevNumber.toString();
        }
        this.go();
    }

    next() {
        let nextNumber = this.pageNumber + 1;
        if (nextNumber > this.pageCount) {
            this.pageNumberValue = "1";
        } else {
            this.pageNumberValue = nextNumber.toString();
        }
        this.go();
    }

    resetChunk() {
        this.chunkSizeValue = "104857600";
        this.setChunkSize();
    }

    setChunkSize() {
        this.clearConsole();
        this.running = true;
        txtReader
            .setChunkSize(this.chunkSize)
            .then(response => {
                this.running = false;
                this.log(`Chunk size is set to ${response.result}`);
            })
            .catch(reason => {
                this.running = false;
                this.error(`setChunkSize encountered error: ${reason}`);
            });
    }

    go() {
        this.clearConsole();
        let start = (this.pageNumber - 1) * this.pageSize;
        let end = start + this.pageSize;
        if (end > this.getResults.length) {
            end = this.getResults.length;
        }
        for (let i = start; i < end; i++) {
            this.echo(
                `${this.getResults[i].lineNumber}: ${this.getResults[i].value}`
            );
        }
    }

    execute() {
        this.clearConsole();
        this.getResults = [];
        switch (this.activeMethodName) {
            case "loadFile":
                this.loadFile();
                break;
            case "getLines":
                this.getLines();
                break;
            case "getSporadicLines":
                this.getSporadicLines();
                break;
            case "iterateLines":
                this.iterateLines();
                break;
            case "iterateSporadicLines":
                this.iterateSporadicLines();
                break;
            case "sniffLines":
                this.sniffLines();
                break;
            case "getLines2":
                this.getLines2();
                break;
            case "testRanges":
                this.testRanges();
                break;
        }
    }

    saveResults(
        results: (Uint8Array | string)[],
        start: number,
        count: number
    ) {
        this.getResults = [];
        let needDecode = typeof results[0] !== "string";
        for (let i = 0; i < results.length; i++) {
            this.getResults.push({
                lineNumber: start + i,
                value: needDecode
                    ? results[i].toString()
                    : (results[i] as string)
            });
        }
    }

    getLines() {
        this.running = true;
        let decode = this.decode;
        txtReader
            .getLines(this.start, this.count, decode)
            .progress(progress => {
                this.progress = progress;
            })
            .then(response => {
                console.log(response);
                this.running = false;
                this.log(`getLine completed in ${response.timeTaken}ms`);
                this.saveResults(response.result, this.start, this.count);
            })
            .catch(reason => {
                this.running = false;
                this.error(`getLine encountered error: ${reason}`);
            });
    }

    testRanges() {
        if (this.linesRanges.length > 0) {
            this.running = true;
            txtReader
                ._testRanges(this.linesRanges)
                .then(response => {
                    let pass: boolean = true;
                    console.log("testranges done: ", response);
                    this.log(`_testRanges finished in ${response.timeTaken}ms`);
                    for (let i = 0; i < response.result.length; i++) {
                        let seek = response.result[i];
                        this.log(
                            `Seek part ${i}: offset: ${seek.start} ~ ${seek.end}, line: ${seek.startLine} ~ ${seek.endLine}, iterateRanges: Array(${seek.iterateRanges.length})`
                        );
                    }
                    let plainIterateRanges: number[] = []; // for testing purpose
                    plainIterateRanges = getPlainRanges(
                        this.linesRanges,
                        1,
                        this.lineCount
                    );
                    this.log(
                        `Expected iterate lines: ${plainIterateRanges.length}`
                    );
                    let seekRanges = response.result;
                    let seekPlain: number[] = [];
                    for (let i = 0; i < seekRanges.length; i++) {
                        let seekRange = seekRanges[i].iterateRanges;
                        for (let j = 0; j < seekRange.length; j++) {
                            let range = seekRange[j];
                            if (typeof range === "number") {
                                if (seekPlain.indexOf(range) > -1) {
                                    this.error(
                                        `Duplicate range (number): ${range}`
                                    );
                                    pass = false;
                                } else if (
                                    range >= 1 &&
                                    range <= this.lineCount
                                ) {
                                    seekPlain.push(range);
                                }
                            } else {
                                for (let k = range.start; k <= range.end; k++) {
                                    if (seekPlain.indexOf(k) > -1) {
                                        this.error(
                                            `Duplicate range (object): {start: ${range.start}, end: ${range.end}} duplicate with number: ${k}`
                                        );
                                        pass = false;
                                    } else if (k >= 1 && k <= this.lineCount) {
                                        seekPlain.push(k);
                                    }
                                }
                            }
                        }
                    }
                    this.log(`Seek lines: ${seekPlain.length}`);
                    if (seekPlain.length === plainIterateRanges.length) {
                        this.log("Match!");
                    } else {
                        this.error(
                            `iterate lines do not match seek lines, iterateRange total: ${plainIterateRanges.length}, seekPlain total: ${seekPlain.length}`
                        );
                        pass = false;
                    }
                    for (let i = 0; i < plainIterateRanges.length; i++) {
                        let line = plainIterateRanges[i];
                        let index = seekPlain.indexOf(line);
                        if (index > -1) {
                            seekPlain.splice(index, 1);
                        } else {
                            this.error(
                                `iterate line: ${line} not found in seekPlain`
                            );
                            pass = false;
                        }
                    }
                    if (seekPlain.length > 0) {
                        this.error(
                            `SeekPlain remaining length: ${seekPlain.length}`
                        );
                        pass = false;
                    }
                    if (pass) {
                        this.log("_testRanges final result: Pass!");
                    } else {
                        this.error("_testRanges failed.");
                    }
                    this.running = false;
                })
                .catch(reason => {
                    this.running = false;
                    this.error(`_testRanges encountered error: ${reason}`);
                });
        }
    }

    getLines2() {
        if (this.linesRanges.length > 0) {
            let decode = this.decode;
            this.running = true;
            txtReader
                .getLines2(this.linesRanges, decode)
                .progress(progress => {
                    this.progress = progress;
                })
                .then(response => {
                    this.running = false;
                    console.log(response);
                })
                .catch(reason => {
                    this.running = false;
                    this.error(`getLine2 encountered error: ${reason}`);
                });
        }
    }

    getSporadicLines() {
        if (this.linesRanges.length > 0) {
            let decode = this.decode;
            this.running = true;
            txtReader
                .getSporadicLines(this.linesRanges, decode)
                .progress(progress => {
                    this.progress = progress;
                })
                .then(response => {
                    this.running = false;
                    this.log(
                        `getSporadicLines completed in ${response.timeTaken}ms`
                    );
                    console.log(response);
                    if (!this.decode) {
                        this.getResults = [];
                        for (let i = 0; i < response.result.length; i++) {
                            this.getResults.push({
                                lineNumber: response.result[i].lineNumber,
                                value: response.result[i].value.toString()
                            });
                        }
                    } else {
                        this.getResults = response.result as GetResults;
                    }
                })
                .catch(reason => {
                    this.running = false;
                    this.error(`getSporadicLines encountered error: ${reason}`);
                });
        }
    }

    iterateLines() {
        let hasRange = this.startValue !== "" && this.countValue !== "";
        this.running = true;
        txtReader
            .iterateLines(
                this.getIteratorConfig(),
                hasRange ? this.start : undefined,
                hasRange ? this.count : undefined
            )
            .progress(progress => {
                this.progress = progress;
            })
            .then(response => {
                this.running = false;
                this.log(`iterateLines completed in ${response.timeTaken}ms`);
                console.log(response);
                this.processIteratorResult(this.iterateOption, response.result);
            })
            .catch(reason => {
                this.running = false;
                this.error(`iterateLines encountered error: ${reason}`);
            });
    }

    iterateSporadicLines() {
        if (this.linesRanges.length > 0) {
            this.running = true;
            txtReader
                .iterateSporadicLines(
                    this.getIteratorConfig(),
                    this.linesRanges
                )
                .progress(progress => {
                    this.progress = progress;
                })
                .then(response => {
                    this.running = false;
                    this.log(
                        `iterateSporadicLines completed in ${response.timeTaken}ms`
                    );
                    console.log(response);
                    this.processIteratorResult(
                        this.iterateOption,
                        response.result
                    );
                })
                .catch(reason => {
                    this.running = false;
                    this.error(
                        `iterateSporadicLines encountered error: ${reason}`
                    );
                });
        }
    }

    sniffLines() {
        if (this.file) {
            let decode = this.decode;
            this.running = true;
            txtReader
                .sniffLines(this.file, this.lineNumber, decode)
                .progress(progress => {
                    this.progress = progress;
                })
                .then(response => {
                    this.running = false;
                    this.log(`sniffLines completed in ${response.timeTaken}ms`);
                    console.log(response);
                    this.saveResults(response.result, 1, this.lineNumber);
                })
                .catch(reason => {
                    this.running = false;
                    this.error(`sniffLInes encountered error: ${reason}`);
                });
        }
    }

    mounted() {
        console.log("app mounted", this);
    }

    fileChange(event: Event) {
        let fileInput = <HTMLInputElement>event.target;
        if (fileInput.files && fileInput.files.length > 0) {
            this.file = fileInput.files[0];
        }
    }

    mapFileChange(event: Event) {
        let mapFileInput = <HTMLInputElement>event.target;
        if (mapFileInput.files && mapFileInput.files.length > 0) {
            this.customizedLinesRanges = false;
            this.mapFile = mapFileInput.files[0];
            var fr = new FileReader();
            fr.onload = () => {
                let linesRanges = JSON.parse(fr.result as string);
                Object.freeze(linesRanges);
                this.linesRanges = linesRanges;
                this.linesRangesString = `Using JSON file: ${this.mapFile.name}, item length: ${this.linesRanges.length}`;
            };
            fr.readAsText(this.mapFile);
        }
    }

    linesRangesChange(event: Event) {
        console.log(this);
    }

    loadFile() {
        this.running = true;
        txtReader
            .loadFile(
                this.file,
                this.iterateOption !== "0"
                    ? this.getIteratorConfig()
                    : undefined
            )
            .progress(progress => {
                this.progress = progress;
            })
            .then(response => {
                this.running = false;
                console.log(response);
                this.lineCount = response.result.lineCount;
                this.log(
                    `Load file ${this.file.name} completed in ${response.timeTaken}ms`
                );
                this.log(`Found lines: ${response.result.lineCount}`);
                if (this.iterateOption !== "0") {
                    this.processIteratorResult(
                        this.iterateOption,
                        response.result.scope
                    );
                }
                this.isFileLoaded = true;
            })
            .catch(error => {
                this.running = false;
                this.error(`loadFile encountered error: ${error}`);
            });
    }

    getIteratorConfig(): IIteratorConfig {
        if (this.iterateOption === "2") {
            return {
                eachLine: function(raw, progress, lineNumber) {
                    if (this.first === null) {
                        this.first = raw;
                        this.firstLineNumber = lineNumber;
                    }
                    this.last = raw;
                    this.lastLineNumber = lineNumber;
                },
                scope: {
                    first: null,
                    firstLineNumber: 0,
                    last: null,
                    lastLineNumber: 0
                }
            };
        }
        return {
            eachLine: function() {
                this.count++;
            },
            scope: {
                count: 0
            }
        };
    }

    echo(message: string) {
        this.messages.push({
            content: message,
            type: "echo"
        });
    }

    log(message: string) {
        this.messages.push({
            content: message,
            type: "normal"
        });
    }

    error(message: string) {
        this.messages.push({
            content: message,
            type: "error"
        });
    }

    clearConsole() {
        this.messages = [];
    }

    processIteratorResult(iterateOption: string, scope: any) {
        if (iterateOption === "1") {
            this.log(`iterate count: ${scope.count}`);
        } else if (iterateOption === "2") {
            this.echo(
                `First line (${
                    scope.firstLineNumber
                }): ${txtReader.utf8decoder.decode(scope.first)}`
            );
            this.echo(
                `Last line (${
                    scope.lastLineNumber
                }): ${txtReader.utf8decoder.decode(scope.last)}`
            );
        }
    }
}
</script>

<style lang="less">
body {
    font-family: Segoe UI, Segoe WP, Arial, Sans-Serif;
}
#status-bar {
    > div {
        display: inline-block;
        margin-left: 15px;
    }
}
#console {
    font-family: Consolas, Menlo, Monaco, Lucida Console, Liberation Mono,
        DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace,
        sans-serif;
    background: rgba(0, 0, 0, 0.8);
    color: #15ff00;
    width: calc(100% - 40px);
    height: calc(100vh - 150px);
    margin: 10px auto;
    overflow-y: auto;
    white-space: pre-wrap;
    > .error {
        color: red;
    }
    > .echo {
        color: #d8d8d8;
    }
    > div {
        padding: 3px;
    }
}
#lines-ranges {
    width: 400px;
    height: 100px;
}
</style>