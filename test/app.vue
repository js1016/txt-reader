<template>
    <div id="app">
        <div id="status-bar">
            <input type="file" id="file-input" v-on:change="fileChange" />
            <div class="line-count">Line count: {{txtReader.lineCount}}</div>
            <div class="status">Status: {{running?'Running':'Idle'}}</div>
            <div class="progress">Progress: {{running?progress:'N/A'}}</div>
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
                <input type="number" v-model="startValue" />
                <span>Count:</span>
                <input type="number" v-model="countValue" />
            </div>
            <div v-if="activeMethod.hasDecode" id="decode">
                <label for="decode-checkbox">Decode:</label>
                <input type="checkbox" v-model="decode" id="decode-checkbox" />
            </div>
            <div v-if="activeMethod.iteratable">
                <span>Iterate action:</span>
                <select v-model="iterateOption">
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
            <button @click="execute">Execute</button>
            <button @click="clearConsole">Clear Console</button>
        </div>
        <div id="console">
            <div
                v-for="message in messages"
                v-html="message.content"
                :class="{error:message.isError,normal:!message.isError}"
            ></div>
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
import { WSAEINTR } from "constants";

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
    isError: boolean;
};

@Component
export default class App extends Vue {
    isFileLoaded: boolean = false;
    sporadicLinesValue: string = "";
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

    execute() {
        this.clearConsole();
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
                    let first = decode
                        ? (response.result[0] as string)
                        : this.txtReader.utf8decoder.decode(response
                              .result[0] as Uint8Array);
                    let last = decode
                        ? (response.result[
                              response.result.length - 1
                          ] as string)
                        : this.txtReader.utf8decoder.decode(response.result[
                              response.result.length - 1
                          ] as Uint8Array);
                    this.log(`getLine completed in ${response.timeTaken}ms`);
                    this.log(`First line: ${first}`);
                    this.log(`Last line: ${last}`);
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
                })
                .catch(reason => {
                    this.running = false;
                    3;
                    this.error(`getSporadicLines encountered error: ${reason}`);
                });
        }
    }

    iterateLines() {}

    iterateSporadicLines() {}

    sniffLines() {}

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
                    this.processIteratorResult(response.result.scope);
                }
                this.isFileLoaded = true;
            })
            .catch(error => {
                this.running = false;
                this.error(`loadFile encountered error: ${error}`);
            });
    }

    getIteratorConfig(): IIteratorConfig {
        return {
            eachLine: function() {
                this.count++;
            },
            scope: {
                count: 0
            }
        };
    }

    log(message: string) {
        this.messages.push({
            content: message,
            isError: false
        });
    }

    error(message: string) {
        this.messages.push({
            content: message,
            isError: true
        });
    }

    clearConsole() {
        this.messages = [];
    }

    processIteratorResult(scope: any) {
        this.log(`iterate count: ${scope.count}`);
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
    > .error {
        color: red;
    }
    > div {
        padding: 3px;
    }
}
</style>