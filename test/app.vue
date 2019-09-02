<template>
    <div id="app">
        <div id="status-bar">
            <input type="file" id="file-input" v-on:change="fileChange" />
            <button v-on:click="loadFile">Load File</button>
            <div class="line-count">Line count: {{txtReader.lineCount}}</div>
            <div class="status">Status: {{running?'Running':'Idle'}}</div>
            <div class="progress">Progress: {{running?progress:'N/A'}}</div>
        </div>
        <div id="command">
            <select></select>
        </div>
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { Component, Prop } from "vue-property-decorator";
import { TxtReader } from "../txt-reader";

@Component
export default class App extends Vue {
    txtReader: TxtReader = window.txtReader;
    file!: File;
    running: boolean = false;
    progress: number = 0;
    iterateOptions: { text: string; value: string }[] = [
        { text: "Get first line and last line", value: "0" },
        { text: "Get iterate count", value: "1" }
    ];

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