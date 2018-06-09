const merge = require('webpack-merge');
const common = require('./webpack.common');
const path = require('path');

module.exports = merge(common, {
    entry: {
        'txt-reader': './factory/txt-reader-for-node.js'
    },
    output: {
        path: path.resolve(__dirname),
        filename: '[name].js'
    },
    mode: "production"
});