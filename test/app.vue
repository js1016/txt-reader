<template>
    <div id="app">
        <div id="status-bar">
            <input type="file" id="file-input" v-on:change="fileChange" />
            <button v-on:click="loadFile">Load File</button>
            <div class="line-count">Line count: {{txtReader.lineCount}}</div>
            <div class="status">Status: {{running?'Running':'Idle'}}</div>
            <div class="progress">Progress: {{running?progress:'N/A'}}</div>
        </div>
        <div id="methods">
            <template v-for="(value, name) in methods">
                <input type="radio" :id="name" :value="name" v-model="activeMethodName" />
                <label :for="name">{{value.signature}}</label>
            </template>
        </div>
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { Component, Prop } from "vue-property-decorator";
import { TxtReader } from "../txt-reader";

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

@Component
export default class App extends Vue {
    txtReader: TxtReader = window.txtReader;
    file!: File;
    running: boolean = false;
    progress: number = 0;
    activeMethodName: string = "";
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

    mounted() {
        console.log("app mounted", this);
    }
    fileChange(event: Event) {
        let fileInput = <HTMLInputElement>event.target;
        if (fileInput.files && fileInput.files.length > 0) {
            this.file = fileInput.files[0];
        }
    }
    loadFile() {
        this.running = true;
        this.txtReader
            .loadFile(this.file)
            .progress(progress => {
                this.progress = progress;
            })
            .then(response => {
                this.running = false;
            })
            .catch(error => {
                this.running = false;
            });
    }
}
</script>

<style lang="less">
#status-bar {
    > div {
        display: inline-block;
        margin-left: 15px;
    }
}
</style>