
import { TxtReader } from "../txt-reader";

declare global {
    interface Window {
        txtReader: TxtReader
    }
}

window.txtReader = new TxtReader();

import Vue from "vue";
import App from './app.vue';
let app = new Vue({
    el: "#app",
    template: '<App/>',
    components: {
        App
    }
});

