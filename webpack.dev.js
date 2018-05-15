const merge = require('webpack-merge');
const common = require('./webpack.common');
const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = merge(common, {
    entry: {
        'txt-reader': './factory/txt-reader-for-browser.js'
    },
    output: {
        path: path.resolve(__dirname, 'tests/dist'),
        filename: '[name].js'
    },
    mode: 'development',
    plugins: [
        new CleanWebpackPlugin(['tests/dist'])
    ]
});