const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const WorkerInlinifyWebpackPlugin = require('worker-inlinify-webpack-plugin');

module.exports = {
    entry: {
        index: './tests/index.ts',
        'txt-reader-worker': './txt-reader-worker.ts'
    },
    output: {
        path: path.resolve(__dirname, './tests/dist'),
        filename: '[name].js'
    },
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader'
            },
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                exclude: /node_modules/,
                options: {
                    appendTsSuffixTo: [/\.vue$/],
                }
            },
            {
                test: /\.less$/,
                use: [
                    'vue-style-loader',
                    'css-loader',
                    'less-loader'
                ]
            },
            {
                test: /\.css$/,
                use: [
                    'vue-style-loader',
                    'css-loader'
                ]
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js', '.vue', '.json'],
        alias: {
            'vue$': 'vue/dist/vue.esm.js'
        }
    },
    devServer: {
        contentBase: path.join(__dirname, './tests/dist'),
        historyApiFallback: true,
        port: 8081,
        compress: true
    },
    performance: {
        hints: false
    },
    devtool: '#eval-source-map',
    plugins: [
        new CleanWebpackPlugin(),
        new VueLoaderPlugin(),
        new WorkerInlinifyWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './tests/index.html',
            chunks: ['index']
        })
    ],
    mode: 'development'
}