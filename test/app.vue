<template>
    <div id="app">
        <input type="file" id="file-input" />
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { Component, Prop } from "vue-property-decorator";
import { TxtReader } from "../txt-reader";

let txtReader = window.txtReader;

@Component
export default class App extends Vue {
    mounted() {
        console.log(txtReader);
        console.log("app mounted");
    }
}
</script>

<style lang="less">
</style>