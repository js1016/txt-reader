<template>
    <div id="app">hi</div>
</template>

<script lang="ts">
import Vue from "vue";
//import Component from "vue-class-component";

export default class App extends Vue {
    test: string = "test";
    mounted() {
        console.log("app mounted");
    }
}
</script>

<style lang="less">
</style>