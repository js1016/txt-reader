const path = require('path');
const WorkerInlinifyWebpackPlugin = require('worker-inlinify-webpack-plugin');

module.exports = {
    entry: {
        'txt-reader-worker': './txt-reader-worker.ts'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader'
            }
        ]
    },
    plugins: [
        new WorkerInlinifyWebpackPlugin()
    ]
}