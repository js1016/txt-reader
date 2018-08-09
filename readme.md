txt-reader
==========
[![NPM version](https://img.shields.io/npm/v/txt-reader.svg?style=flat)](https://www.npmjs.com/package/txt-reader) [![NPM downloads](http://img.shields.io/npm/dm/txt-reader.svg?style=flat)](https://www.npmjs.com/package/txt-reader) [![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

TxtReader is a JavaScript library to read text file in browsers based on [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader). It can read very large, huge, giant files (GB+). It offloads the file reading operations to [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) so that it won't block browser UI rendering even though it is reading a very large file. And you can easily track the reading progress by using promise-like methods. [Click here to check the demo](https://js1016.github.io/txt-reader/)
# Contents
* [Installation](#user-content-installation)
    * [npm](#user-content-npm)
    * [CommonJS](#user-content-commonjs)
    * [ES2015 or TypeScript](#user-content-es2015-or-typescript)
    * [HTML script tag](#user-content-html-script-tag)
* [Methods](#user-content-methods)
    * [Constructor](#user-content-instantiate-the-txtreader)
    * [loadFile(file[ ,iteratorConfig])](#user-content-loadfilefile-iteratorconfig)
    * [getLines(start, count)](#user-content-getlinesstart-count)
    * [iterateLines(iteratorConfig[, start, count])](#user-content-iteratelinesiteratorconfig-start-count)
* [Properties](#user-content-properties)
    * [lineCount](#user-content-linecount)
    * [utf8decoder](#user-content-utf8decoder)
* [Sample](#user-content-sample)
* [Browser Compatibility](#user-content-browser-compatibility)

# Installation
## npm
Get it via _npm_ by adding `txt-reader` to your `package.json` or run:
```bash
npm install --save txt-reader
```

## CommonJS
Do `npm install --save txt-reader` first and then you can use `TxtReader` as below:
```javascript
var TxtReader = require('txt-reader').TxtReader;
```

## ES2015 or TypeScript
Do `npm install --save txt-reader` first and then you can use `TxtReader` as below:
```ts
import { TxtReader } from "txt-reader"
```

## HTML script tag
Alternatively you can download this project folder from [Github](https://github.com/js1016/txt-reader) and get the `txt-reader.min.js` from `txt-reader/dist`, then make a reference in `<script>` tag.

```html
<script src="txt-reader.min.js"></script>
```

The `txt-reader.min.js` registers a global variable at `window.TxtReader`.

# Methods
## Instantiate the TxtReader
To start using `TxtReader`, we need to create an instance of `TxtReader`.
```javascript
var reader = new TxtReader();
```

## loadFile(file[ ,iteratorConfig])
After creating instance, we can load any text file into `TxtReader` using `loadFile()`, this method asynchronously goes through the text file and returns the line number. For large text file, it may take dozens of seconds to complete, we can use `.progress()`, `.then()` and `.catch()` to track the method running progress and results. This method accepts a customized iterator so you can do some initialization jobs towards each line in the text file.

#### Syntax
```javascript
reader.loadFile(file[, iteratorConfig])
.progress(function(progress) {
    // onProgress callback
    // progress (Number): task progress in Number value from 1-100
})
.then(function(response) {
    // onComplete callback
    // response.timeTaken (Number): task time taken in millisecond
    // response.result.lineCount (Number): total line number
    // response.result.scope (Object): if you assigned an iterator, the iterator "this" scope can be accessed here
})
.catch(function(reason) {
    // onFail callback
    // reason (String): failure reason
});
```

#### Arguments

| Parameter        | Type           | Description  |
| ------------- |:-------------:| -----|
| file      | File | The text file to be read, only supports __UTF-8__ encoding.|
| iteratorConfig      | Object | Optional. The `iteratorConfig` allows you to run customized iterator function for each line in the text file during loading the file. For detailed usage, please check the [iterateLines()](#iteratelines-iteratorconfig-start-count-) method. <br>__NOTE__ that inappropriate usage of iterator may bring performance issue.|


#### Return value
This method returns an instance of `TxtReaderTask`, the `TxtReaderTask` implements three promise-like methods: `.progress()`, `.then()` and `.catch()`.

###### .progress(onProgress)

| Parameter        | Type           | Description  |
| ------------- |:-------------:| -----|
| onProgress      | Function | Function to execute for each task progress update message, taking one argument:<br> __progress__ (Number): Indicating the current task progress in `Number` from 0-100.|

Appends an `onProgress` handler to the `TxtReaderTask` and returns the `TxtReaderTask`.

###### .then(onComplete)

| Parameter        | Type           | Description  |
| ------------- |:-------------:| -----|
| onComplete      | Function | Function to execute when a task completes, taking one argument:<br>__response__ (TaskResponse) where you can get the loadFile task execution time taken (millisecond) in `response.timeTaken`, the text file line number in `response.result.lineCount` and the iterator `this` scope in `response.result.scope` if a customized iterator was specified.|

Appends an `onComplete` handler to the `TxtReaderTask` and returns the `TxtReaderTask`. The `TaskResponse` is an object with following structure.

```ts
interface ITaskResponse {
    timeTaken: number; // total time taken of the task
    message: string; // task response message
    result: any; // task execution result
}
```

##### .catch(onFail)
| Parameter        | Type           | Description  |
| ------------- |:-------------:| -----|
| onFail      | Function | Function to execute when a task fails, taking one argument: <br>__reason__ (String): The failure reason|

Appends an `onFail` handler to the `TxtReaderTask` and returns the `TxtReaderTask`.

## getLines(start, count)
Get specific lines from the text file. Similar to `TxtParser.loadFile(file[ ,iteratorConfig])`, this is also an asynchronous function.

#### Syntax

```javascript
reader.getLines(start, count)
.progress(function(progress) {
    // onProgress callback
    // progress (Number): task progress in Number value from 1-100
})
.then(function(response) {
    // onComplete callback
    // response.timeTaken (Number): task time taken in millisecond
    // response.result (Array[String]): lines collection in string array
})
.catch(function(reason) {
    // onFail callback
    // reason (String): failure reason
});
```

#### Arguments

| Parameter        | Type           | Description  |
| ------------- |:-------------:| -----|
| start      | Number | The line number of the first line to include in the returned array.|
| count      | Number | The number of lines to get.|

#### Return value
Same as `loadFile()` method, `getLines()` also returns an instance of `TxtReaderTask`. The results can be retrieved from `response.result` as an array in the `onComplete` callback.

## iterateLines(iteratorConfig[, start, count])
This method executes a provided function once for each line in the text file or a selected range. Same as `loadFile()`, it is an asynchronous function and returns `TxtReaderTask` where you can use `.progress()`, `.then()` and `.catch()` to get the task running progress and result.

#### Syntax
```javascript
reader.iterateLines({
    eachLine: function(raw, progress, lineNumber) {
        // your iterator
        // raw (Uint8Array): the raw data of current line
        // progress (Number): a more accurate progress number of the iterating process for current line
        // lineNumber (Number): the line number of current line
        // HOW TO DECODE RAW DATA?
        // You can call "this.decode(raw)" in your iterator to decode the raw data
    },
    scope: {
        // optional
        // You can initialize any properties here and get or set the properties via "this" in the "eachLine" callback.
        // The modified scope will be returned as "response.result" in the "onComplete" callback.
    }
}, start, count)
```

#### Arguments

| Parameter        | Type           | Description  |
| ------------- |:-------------:| -----|
| iteratorConfig      | Object | Object to define the iterator method and the `this` scope of the iterator.|
| start      | Number | Optional. The line number of the first line to iterate. If you don't specify the start and count arguments, it will iterate all lines in the text file.|
| count      | Number | Optional. The number of lines to iterate.|

### The `iteratorConfig`
The `iteratorConfig` takes two properties:

| Property Name        | Type           | Description  |
| ------------- |:-------------:| -----|
| eachLine      | Function | The iterator function to execute for each line in the selected range, taking three arguments:<br>__raw__ (Uint8Array): the raw data of current line in Uint8Array format, you can use `this.decode(raw)` in iterator to decode it to readable string.<br>__progress__ (Number): a more accurate progress number of the iterating process for current line<br>__lineNumber__ (Number): the line number of current line|
| scope      | Object | Optional. You can initialize any properties here and get or set the properties via `this` in the `eachLine` callback. The modified scope will be returned as `response.result` in the `onComplete` callback.|

#### Return value
Same as `loadFile()` method, `iterateLines()` also returns an instance of `TxtReaderTask`. You can predefine any properties in `scope` and access the `scope` from `this` context in your iterator, the `scope` will finally be returned as `response.result` in the `onComplete` callback.

# Properties
## lineCount
Type: Number

Returns the line number of the loaded text file. If no text file has been loaded, it returns 0. This is a readonly property.

## utf8decoder
Type: An object of [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/TextDecoder) in UTF-8 encoding.

If the browser natively supports [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/TextDecoder), then it equals to `new TextDeocder('utf-8')`, otherwise consider it as a polyfill. This is a helper method in case you need to decode ArrayBuffer to text.

# Sample

```javascript
var reader = new TxtReader();
var file = document.getElementById('file-input').files[0];

reader.loadFile(file)
    .progress(function (progress) {
        console.log('Loading file progress: ' + progress + '%');
    })
    .then(function (response) {
        console.log('Loading file completed in ' + response.timeTaken + 'ms, total lines: ' + response.result.lineCount);
        exectueAfterLoadFileComplete();
    })
    .catch(function (reason) {
        console.log('Loading file failed with error: ' + reason);
    });

function exectueAfterLoadFileComplete() {
    reader.getLines(10, 10)
        .progress(function (progress) {
            console.log('Getting lines progress: ' + progress + '%');
        })
        .then(function (response) {
            console.log('Lines are: ', response.result);
        })
        .catch(function (reason) {
            console.log('Getting lines failed with error: ' + reason);
        });
    reader.iterateLines({
        eachLine: function (raw, progress, lineNumber) {
            if (this.decode(raw).indexOf('2018') > -1) {
                this.count++;
            }
        },
        scope: {
            count: 0
        }
    })
        .progress(function (progress) {
            console.log('Iterating lines progress: ' + progress + '%');
        })
        .then(function (response) {
            console.log(response.result.count + ' lines contain "2018"');
        })
        .catch(function (reason) {
            console.log('Iterating lines failed with error: ' + reason);
        });
}

reader.utf8decoder.decode(new Uint8Array(['a'.charCodeAt(0)])) === 'a' // true
```

# Browser Compatibility
`txt-reader` can run on most major browsers that support [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader) and [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).
* Chrome
* Edge
* Firefox
* IE11