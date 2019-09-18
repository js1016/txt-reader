<template>
    <div id="app">
        <div id="status-bar">
            <input type="file" id="file-input" v-on:change="fileChange" />
            <div class="line-count">
                Line count:
                <span>{{txtReader.lineCount}}</span>
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
                <input
                    type="radio"
                    :id="name"
                    :value="name"
                    v-model="activeMethodName"
                    :disabled="!isFileLoaded&&name!=='loadFile'&&name!=='sniffLines'"
                />
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
            <div v-if="activeMethod.isSporadic">
                <div>
                    <span>Sporaidc Lines:</span>
                    <input type="number" v-model="sporadicLinesValue" />
                    <span>lines</span>
                </div>
                <div>
                    <span>sporadicLinesMap:</span>
                    <textarea
                        :disabled="!sporadicCustomize"
                        v-model="sporadicMapString"
                        v-on:change="sporadicLinesMapChange"
                    ></textarea>
                    <input type="checkbox" v-model="sporadicCustomize" id="sporadic-customize" />
                    <label for="sporadic-customize">Customize</label>
                </div>
            </div>
            <div v-if="activeMethod.hasLineNumber">
                <span>Line Number:</span>
                <input type="number" v-model="lineNumberValue" />
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
            <div v-for="message in messages" v-html="message.content" :class="message.type"></div>
        </div>
    </div>
</template>

<script lang="ts">
import * as json5 from "json5";
import Vue from "vue";
import { Component, Prop, Watch } from "vue-property-decorator";
import { TxtReader, IIteratorConfig } from "../txt-reader";
import { LinesRange } from "../txt-reader-common";
import {
    IIteratorConfigMessage,
    SporadicLineItem,
    SporadicLinesMap
} from "../txt-reader-common";

type Methods = {
    loadFile: MethodConfig;
    getLines: MethodConfig;
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
    isSporadic: boolean;
    hasDecode: boolean;
    hasLineNumber: boolean;
}

type Message = {
    content: string;
    type: string;
};

type GetResults = { lineNumber: number; value: string }[];

@Component
export default class App extends Vue {
    chunkSizeValue: string = "104857600";
    pageSize: number = 1000;
    getResults: GetResults = [];
    isFileLoaded: boolean = false;
    sporadicLinesValue: string = "";
    pageNumberValue: string = "1";
    sporadicMapString: string = "";
    sporadicCustomize: boolean = false;
    sporadicLineMap: SporadicLinesMap = [];
    iterateOption: string = "0";
    decode: boolean = true;
    startValue: string = "";
    lineNumberValue: string = "";
    countValue: string = "";
    txtReader: TxtReader = window.txtReader;
    file!: File;
    running: boolean = false;
    progress: number = 0;
    activeMethodName: string = "loadFile";
    messages: Message[] = [];
    methods: Methods = {
        loadFile: {
            signature: "loadFile(file[ ,iteratorConfig])",
            hasStartCount: false,
            iteratable: true,
            isSporadic: false,
            hasDecode: false,
            hasLineNumber: false
        },
        getLines: {
            signature: "getLines(start, count[, decode])",
            hasStartCount: true,
            iteratable: false,
            isSporadic: false,
            hasDecode: true,
            hasLineNumber: false
        },
        getSporadicLines: {
            signature: "getSporadicLines(sporadicLinesMap[, decode])",
            hasStartCount: false,
            iteratable: false,
            isSporadic: true,
            hasDecode: true,
            hasLineNumber: false
        },
        iterateLines: {
            signature: "iterateLines(iteratorConfig[, start, count])",
            hasStartCount: true,
            iteratable: true,
            isSporadic: false,
            hasDecode: false,
            hasLineNumber: false
        },
        iterateSporadicLines: {
            signature: "iterateSporadicLines(iteratorConfig, sporadicLinesMap)",
            hasStartCount: false,
            iteratable: true,
            isSporadic: true,
            hasDecode: false,
            hasLineNumber: false
        },
        sniffLines: {
            signature: "sniffLines(file, lineNumber[, decode])",
            hasStartCount: false,
            iteratable: false,
            isSporadic: false,
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

    get sporadicLines(): number {
        return Number(this.sporadicLinesValue);
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

    @Watch("sporadicMapString")
    onSporadicMapStringChange(value: string) {
        if (this.sporadicCustomize) {
            try {
                this.sporadicLineMap = json5.parse(value);
            } catch {}
        }
    }

    @Watch("sporadicLines")
    onSporadicLinesChange(count: number) {
        this.sporadicCustomize = false;
        this.sporadicLineMap = [];
        if (count >= this.txtReader.lineCount || count <= 0) {
            this.sporadicLineMap.push({
                start: 1,
                count: this.txtReader.lineCount
            });
        } else {
            if (count <= 10000) {
                let paraNumber = count + 1;
                let each = this.txtReader.lineCount / paraNumber;
                for (let i = 0; i < count; i++) {
                    let lineNumber = Math.floor((i + 1) * each);
                    if (lineNumber > this.txtReader.lineCount) {
                        lineNumber = this.txtReader.lineCount;
                    } else if (lineNumber < 1) {
                        lineNumber = 1;
                    }
                    this.sporadicLineMap.push(lineNumber);
                }
            } else {
                let maxPerBlock = Math.floor(this.txtReader.lineCount / 10000);
                let perBlockLength = Math.floor(count / 10000);
                for (let i = 0; i < 10000; i++) {
                    let start = i * maxPerBlock + 1;
                    this.sporadicLineMap.push({
                        start: start,
                        end: start + perBlockLength - 1
                    });
                }
                let rest = count - perBlockLength * 10000;
                if (rest) {
                    for (let i = 0; i < this.sporadicLineMap.length; i++) {
                        let current = this.sporadicLineMap[i] as LinesRange;
                        let nextStart =
                            i < this.sporadicLineMap.length - 1
                                ? (this.sporadicLineMap[i + 1] as LinesRange)
                                      .start
                                : this.txtReader.lineCount + 1;
                        if ((current.end as number) < nextStart - 1) {
                            if (i < this.sporadicLineMap.length - 1) {
                                (current.end as number)++;
                                rest--;
                                if (rest === 0) {
                                    break;
                                }
                            } else {
                                let tryEnd = (current.end as number) + rest;
                                current.end =
                                    tryEnd > this.txtReader.lineCount
                                        ? this.txtReader.lineCount
                                        : tryEnd;
                            }
                        }
                    }
                }
            }
        }
        this.sporadicMapString = JSON.stringify(this.sporadicLineMap);
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
        this.txtReader
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
                    ? this.txtReader.utf8decoder.decode(results[
                          i
                      ] as Uint8Array)
                    : (results[i] as string)
            });
        }
    }

    getLines() {
        if (this.start > 0 && this.count > 0) {
            this.running = true;
            let decode = this.decode;
            this.txtReader
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
    }

    getSporadicLines() {
        if (this.sporadicLineMap.length > 0) {
            let decode = this.decode;
            this.running = true;
            this.txtReader
                .getSporadicLines(this.sporadicLineMap, decode)
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
                                value: this.txtReader.utf8decoder.decode(
                                    response.result[i].value as Uint8Array
                                )
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
        let hasRange = this.start > 0 && this.count > 0;
        this.running = true;
        this.txtReader
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
        if (this.sporadicLineMap.length > 0) {
            this.running = true;
            this.txtReader
                .iterateSporadicLines(
                    this.getIteratorConfig(),
                    this.sporadicLineMap
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
        if (this.file && this.lineNumber > 0) {
            let decode = this.decode;
            this.running = true;
            this.txtReader
                .sniffLines(this.file, this.lineNumber, decode)
                .progress(progress => {
                    this.progress = progress;
                })
                .then(response => {
                    this.running = false;
                    this.log(`sniffLines completed in ${response.timeTaken}ms`);
                    console.log(response);
                    this.saveResults(response.result, 1, this.lineNumber);
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

    sporadicLinesMapChange(event: Event) {
        console.log(this);
    }

    loadFile() {
        this.running = true;
        this.txtReader
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
            this.log(
                `First line (${
                    scope.firstLineNumber
                }): ${this.txtReader.utf8decoder.decode(scope.first)}`
            );
            this.log(
                `Last line (${
                    scope.lastLineNumber
                }): ${this.txtReader.utf8decoder.decode(scope.last)}`
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
</style>