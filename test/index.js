"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var txt_reader_1 = require("../txt-reader");
window.txtReader = new txt_reader_1.TxtReader();
var vue_1 = __importDefault(require("vue"));
var app_vue_1 = __importDefault(require("./app.vue"));
var app = new vue_1["default"]({
    el: "#app",
    template: '<App/>',
    components: {
        App: app_vue_1["default"]
    }
});
