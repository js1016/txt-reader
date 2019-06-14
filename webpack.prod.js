const merge = require('webpack-merge');
const common = require('./webpack.common');
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = merge(common, {
    entry: {
        'txt-reader.min': './factory/txt-reader-for-browser.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js'
    },
    plugins: [
        new CleanWebpackPlugin()
    ],
    mode: 'production'
});