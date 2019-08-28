import Vue from "vue";
import App from './app.vue';
import { TxtReader } from "../txt-reader";

declare global {
    interface Window {
        txtReader: TxtReader
    }
}

let app = new Vue({
    el: "#app",
    template: '<App/>',
    components: {
        App
    }
});

window.txtReader = new TxtReader();
