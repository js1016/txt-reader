import { TextDecoder } from 'text-encoding-shim'
import './polyfill'
import { IRequestMessage, IResponseMessage, IIteratorConfigMessage, LinesRange, LinesRanges, IGetSporadicLinesResult } from './txt-reader-common'

interface ILineIndexRange {
    start: number;
    end: number;
    startLine: number;
    endLine: number;
    linesRanges: LinesRanges;
}

interface IIterateLinesConfig {
    config: IIteratorConfigMessage;
    start: number | null;
    count: number | null;
}

interface ISniffConfig {
    lineNumber: number;
    decode: boolean;
}

const utf8decoder = new TextDecoder('utf-8');

let DEFAULT_CHUNK_SIZE: number = 1024 * 1024 * 100;

let currentTaskId: number | null = null;

let txtReaderWorker: TxtReaderWorker | null = null;

let sniffWorker: TxtReaderWorker | null = null;

let verboseLogging: boolean = false;

const useTransferrable: boolean = navigator.userAgent.indexOf('Firefox') > -1;

const respondMessage = (responseMessage: ResponseMessage): void => {
    if (responseMessage.done) {
        currentTaskId = null;
    }
    postMessage.apply(null, [responseMessage]);
};

const respondTransferrableMessage = (responseMessage: ResponseMessage, arr: Transferable[]): void => {
    if (responseMessage.done) {
        currentTaskId = null;
    }
    postMessage(responseMessage, arr);
};

const createProgressResponseMessage = (progress: Number): ResponseMessage => {
    let responseMessage: ResponseMessage = new ResponseMessage(progress);
    responseMessage.done = false;
    return responseMessage;
};

const validateWorker = (): boolean => {
    if (txtReaderWorker === null) {
        respondMessage(new ResponseMessage(false, 'File has not been loaded into the worker, need to loadFile first.'));
        return false;
    }
    return true;
};

const mergeUint8Array = (x: Uint8Array, y: Uint8Array): Uint8Array => {
    if (x.byteLength === 0) {
        return y;
    }
    if (y.byteLength === 0) {
        return x;
    }
    let z: Uint8Array = new Uint8Array(x.byteLength + y.byteLength);
    z.set(x, 0);
    z.set(y, x.byteLength);
    return z;
};

let isLineWithinLinesRange = (line: number, linesRange: LinesRange): boolean => {
    return line >= linesRange.start && line <= linesRange.end;
};

let getLinesRangeCount = (linesRange: LinesRange): number => {
    return linesRange.end - linesRange.start + 1;
};

let getStart = (linesRange: LinesRange | number): number => {
    return typeof linesRange === 'number' ? linesRange : linesRange.start;
};

let getEnd = (linesRange: LinesRange | number): number => {
    return typeof linesRange === 'number' ? linesRange : linesRange.end;
};

self.addEventListener('message', (event: MessageEvent) => {
    let req: IRequestMessage = event.data;
    if (verboseLogging) {
        console.log('Worker thread received a message from main thread: \r\n', event.data);
    }
    if (currentTaskId !== null) {
        throw ('The worker thread is busy.');
    }
    currentTaskId = req.taskId;
    switch (req.action) {
        case 'loadFile':
            txtReaderWorker = new TxtReaderWorker(req.data.file, req.data.config);
            break;
        case 'enableVerbose':
            verboseLogging = true;
            respondMessage(new ResponseMessage(true));
            break;
        case 'setChunkSize':
            if (typeof req.data !== 'number' || req.data < 1) {
                respondMessage(new ResponseMessage(false, 'Invalid CHUNK_SIZE, must be greater than 1.'));
                return;
            }
            if (txtReaderWorker) {
                txtReaderWorker.CHUNK_SIZE = req.data;
            }
            DEFAULT_CHUNK_SIZE = req.data;
            respondMessage(new ResponseMessage(DEFAULT_CHUNK_SIZE));
            break;
        case 'getLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).getLines(req.data.start, req.data.count);
            }
            break;
        case 'getLines2':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).getLines2(req.data);
                break;
            }
        case 'getSporadicLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).getSporadicLines(req.data.linesRanges, req.data.decode);
            }
            break;
        case 'iterateLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).iterateLines(req.data)
            }
            break;
        case 'iterateSporadicLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).iterateSporadicLines(req.data.config, req.data.lines);
            }
            break;
        case 'sniffLines':
            sniffWorker = new TxtReaderWorker(req.data.file, undefined, {
                lineNumber: req.data.lineNumber,
                decode: req.data.decode
            });
            break;
    }
});

class ResponseMessage implements IResponseMessage {
    public success: boolean;
    public message: string;
    public result: any;
    public taskId: number;
    public done: boolean;
    constructor(x: any);
    constructor(x: boolean, y: string);
    constructor(x: string, y: any);
    constructor(x: boolean, y: string, z: any);
    constructor(x: any, y?: any, z?: any) {
        this.taskId = <number>currentTaskId;
        if (arguments.length === 1) {
            this.success = true;
            this.message = '';
            this.result = x;
        } else if (arguments.length === 2) {
            switch (typeof x) {
                case 'boolean':
                    this.success = x;
                    this.message = y;
                    this.result = null;
                    break;
                default:
                    this.success = true;
                    this.message = x;
                    this.result = y;
            }
        } else {
            this.success = x;
            this.message = y;
            this.result = z;
        }
        this.done = true;
    }
}

class Iterator {
    // temp line data saved during last seek operation
    public lineView: Uint8Array;

    // whether last view ends with CR
    public lastViewEndsWithCR: boolean;

    // onEachLine callback function for internal methods
    // internal methods like: loadFile, getLines have their own onEachLine callback
    public onEachLineInternal!: (this: Iterator, lineDate: Uint8Array) => void;

    // onSeekComplete callback function
    public onSeekComplete!: (this: Iterator) => void;

    // external onEachLine callback function
    private onEachLine: Function | null;

    // external onEachLine scope
    public eachLineScope: any;

    // seek offset
    public offset: number;

    // whether to create quicksearchmap, default to false
    public buildIndex: boolean;

    // size of each index range
    public indexSize: number;

    // seek destination offset
    public endOffset: number;

    // how many lines to get, default to 0, means iterating all lines
    public linesToIterate: number;

    // how many lines already processed
    public linesProcessed: number;

    // current line number
    public currentLineNumber: number;

    // start line number that we need to get
    public startLineNumber: number;

    // processed sporadic lines
    public sporadicProcessed: number;

    public linesRanges: LinesRanges;

    public isSporadicIterate: boolean;

    private processedViewLength: number;

    public lineBreakLength: number;

    // last progress
    public lastProgress: number;

    public linesIndex: ILineIndexRange[];

    private lastMappedProgress: number | null;

    constructor() {
        this.lineView = new Uint8Array(0);
        this.lastViewEndsWithCR = false;
        this.onEachLine = null;
        this.eachLineScope = null;
        this.offset = 0;
        this.buildIndex = false;
        this.indexSize = 0;
        this.endOffset = 0;
        this.linesToIterate = 0;
        this.linesProcessed = 0;
        this.currentLineNumber = 1;
        this.startLineNumber = 0;
        this.lastProgress = 0;
        this.processedViewLength = 0;
        this.lineBreakLength = 0;
        this.linesIndex = [{
            start: 0,
            startLine: 1,
            end: 0,
            endLine: 0,
            linesRanges: []
        }];
        this.lastMappedProgress = null;
        this.sporadicProcessed = 0;
        this.linesRanges = [];
        this.isSporadicIterate = false;
    }

    public shouldBreak(): boolean {
        if (this.isPartialIterate() && (this.linesProcessed === this.linesToIterate || this.sporadicProcessed === this.linesToIterate)) {
            return true;
        } else {
            return false;
        }
    }

    public isPartialIterate(): boolean {
        // is partial iterate or is sporadic iterate
        return this.linesToIterate > 0;
    }

    public setRanges(linesRanges: LinesRanges, indexes: ILineIndexRange[]) {
        for (let i = 0; i < indexes.length; i++) {
            indexes[i].linesRanges = [];
        }
        for (let i = 0; i < indexes.length; i++) {
            let index = indexes[i];
            for (let j = 0; j < linesRanges.length; j++) {
                let range = linesRanges[j];
                if (typeof range === 'number') {
                    if (range >= index.startLine && range <= index.endLine) {
                        addToIndexRanges(range, index.linesRanges);
                        linesRanges.splice(j, 1);
                        j--;
                    }
                } else {
                    if (range.end >= index.startLine && range.start <= index.endLine) {
                        // has overlap
                        addToIndexRanges(range, index.linesRanges);
                    }
                }

            }
        }

        function addToIndexRanges(range: number | LinesRange, indexRanges: LinesRanges): void | LinesRange {
            let isNumber = typeof range === 'number';
            let rangeStart = getStart(range);
            let rangeEnd = getEnd(range);
            let lastIndexRange = indexRanges.length ? indexRanges[indexRanges.length - 1] : null;
            if (lastIndexRange === null) {
                // first indexRange
                indexRanges.push(range);
                return;
            } else {
                let lastEnd = getEnd(lastIndexRange);
                if (rangeStart > lastEnd + 1) {
                    // [...,6 | {5,6}] + [8 | {8,9}], just append range
                    indexRanges.push(range);
                    return;
                } else if (rangeStart >= lastEnd) {
                    // 1: [...,6] + 6
                    // 2: [...,6] + {6,7} = [...,{6,7}]
                    // 2: [...,6] + 7 = [...,{6,7}]
                    // 2: [...,6] + {7,8} = [...,{6,8}]
                    // 1: [...,{5,6}] + 6
                    // 3: [...,{5,6}] + {6,7} = [...,{5,7}]
                    // 3: [...,{5,6}] + 7 = [...,{5,7}]
                    // 3: [...,{5,6}] + {7,8} = [...,{5,8}]

                    if (isNumber) {
                        // 1
                        return;
                    } else if (typeof lastIndexRange === 'number') {
                        // 2
                        indexRanges[indexRanges.length - 1] = {
                            start: lastIndexRange,
                            end: rangeEnd
                        };
                        return;
                    } else {
                        // 3
                        lastIndexRange.end = rangeEnd;
                        return;
                    }
                }
            }
            for (let i = 0; i < indexRanges.length; i++) {
                let currentRange = indexRanges[i];
                let currentEnd = getEnd(currentRange);
                let nextStart = i < indexRanges.length - 1 ? getStart(indexRanges[i + 1]) : null;
                if (isNumber) {

                }

            }
        }
    }

    public hitLine(lineData: Uint8Array): void {
        let isPartialIterate: boolean = this.isPartialIterate();
        let progress = 0;
        if (!isPartialIterate ||
            (isPartialIterate && this.currentLineNumber >= this.startLineNumber && !this.isSporadicIterate) ||
            this.isSporadicIterate) {
            // complete iterate
            // continuous partial iterate and within range
            // sporadic iterate
            let match = false;
            if (isPartialIterate) {
                if (!this.isSporadicIterate) {
                    this.linesProcessed++;
                    match = true;
                    progress = Math.round(this.linesProcessed / this.linesToIterate * 10000) / 100;
                } else {
                    progress = Math.round(this.sporadicProcessed / this.linesToIterate * 10000) / 100;
                    let first = this.linesRanges[0];
                    if (typeof first === 'number') {
                        if (first === this.currentLineNumber) {
                            this.linesRanges.splice(0, 1);
                            match = true;
                        }
                    } else {
                        if (this.currentLineNumber >= first.start && this.currentLineNumber <= first.end) {
                            // within range
                            if (first.start === first.end) {
                                this.linesRanges.splice(0, 1);
                            } else {
                                first.start++;
                            }
                            match = true;
                        }
                    }
                    if (match) {
                        this.sporadicProcessed++;
                    }
                }
            } else {
                match = true;
                this.linesProcessed++;
                progress = Math.round(this.processedViewLength / this.endOffset * 10000) / 100;
                if (this.buildIndex) {
                    // build index - only triggered when loadFile
                    let last = this.linesIndex[this.linesIndex.length - 1];
                    let currentLineEnd = this.processedViewLength + lineData.length;
                    if (last.end === 0 && (currentLineEnd - last.start > this.indexSize || currentLineEnd === this.endOffset || currentLineEnd + this.lineBreakLength === this.endOffset)) {
                        last.end = currentLineEnd;
                        last.endLine = this.currentLineNumber;
                        let progress = Math.round(currentLineEnd / this.endOffset * 100);
                        if (progress - this.lastProgress >= 1) {
                            respondMessage(createProgressResponseMessage(progress));
                            this.lastProgress = progress;
                        }
                    } else if (last.end !== 0) {
                        let isLast = this.processedViewLength + lineData.length + this.lineBreakLength >= this.endOffset;
                        this.linesIndex.push({
                            start: this.processedViewLength,
                            startLine: this.currentLineNumber,
                            end: isLast ? this.processedViewLength + lineData.length : 0,
                            endLine: isLast ? this.currentLineNumber : 0,
                            linesRanges: []
                        });
                    }
                }
            }
            if (this.onEachLineInternal && match) {
                if (lineData.buffer.byteLength != lineData.byteLength) {
                    lineData = new Uint8Array(lineData);
                }
                this.onEachLineInternal.call(this, lineData);
            }
            if (this.onEachLine !== null && match) {
                if (lineData.buffer.byteLength != lineData.byteLength) {
                    lineData = new Uint8Array(lineData);
                }
                this.onEachLine.call(this.eachLineScope, lineData, progress, this.currentLineNumber);
            }
        }
        if (isPartialIterate) {
            if (this.shouldReportProgress(progress)) {
                this.lastProgress = progress;
                respondMessage(createProgressResponseMessage(progress < 100 ? progress : 100));
            }
        }
        this.processedViewLength += lineData.length + this.lineBreakLength;
        this.currentLineNumber++;
    }

    public shouldReportProgress(currentProgress: number): boolean {
        if (this.lastProgress === 0) {
            return true;
        } else if (currentProgress - this.lastProgress > 5) {
            return true;
        } else {
            return false;
        }
    }

    public bindEachLineFromConfig(config: IIteratorConfigMessage): void {
        this.onEachLine = new Function('return ' + config.eachLine)();
        if (this.eachLineScope === null) {
            // for sporadic iterate, eachLineScope will be set explicitly
            this.eachLineScope = config.scope;
        }
        this.eachLineScope['decode'] = (value: Uint8Array): string => {
            return utf8decoder.decode(value);
        }
    }
}

enum LineBreakType {
    CR,
    CRLF,
    LF,
    UNKNOWN,
    MIX
}

class TxtReaderWorker {
    public CHUNK_SIZE!: number;
    private file!: File;
    private fr!: FileReader;
    private linesIndex!: ILineIndexRange[];
    private lineBreakType: LineBreakType = LineBreakType.UNKNOWN;
    private iterator!: Iterator;
    private lineCount!: number;
    private sniffLines!: (string | Uint8Array)[];

    constructor(file: File, onNewLineConfig?: IIteratorConfigMessage, sniffConfig?: ISniffConfig) {
        if (Object.prototype.toString.call(file).toLowerCase() !== '[object file]') {
            respondMessage(new ResponseMessage(false, 'Invalid file object'));
            return;
        }
        this.CHUNK_SIZE = DEFAULT_CHUNK_SIZE;
        this.file = file;
        this.lineCount = 0;
        this.linesIndex = [];
        this.fr = new FileReader();
        this.fr.onload = () => {
            let view: Uint8Array = new Uint8Array(<ArrayBuffer>this.fr.result);
            let iterator: Iterator = this.iterator;
            while (view.length > 0) {
                // first CR (0x0D, \r) position in the view
                let crIndex: number = view.indexOf(13);
                // first LF (0x0A, \n) position in the view
                let lfIndex: number = view.indexOf(10);
                // for CRLF linebreakLength would be 2, otherwise the value would be 1.
                let lineBreakIndex!: number;
                // If merge all view to lineView
                let mergeAll: boolean = false;
                // If current view ends with CR
                let endsWithCR: boolean = false;
                if (crIndex > 0 && (lfIndex === -1 || crIndex < lfIndex)) {
                    // CR is hit before LF in the view or there is only CR hit in the view
                    // CR is in the middle or end
                    if (crIndex < view.length - 1) {
                        // CR in the middle
                        if (view[crIndex + 1] === 10) {
                            // CRLF
                            lineBreakIndex = crIndex;
                            iterator.lineBreakLength = 2;
                        } else {
                            // CR only in the middle
                            lineBreakIndex = crIndex;
                            iterator.lineBreakLength = 1;
                        }
                    } else {
                        // CR in the end, do MERGEALL first since not sure the linebreak is CR or CRLF
                        endsWithCR = true;
                        mergeAll = true;
                    }
                } else if (crIndex === 0) {
                    // CR is the first byte
                    if (view.length > 1) {
                        if (view[1] === 10) {
                            // CRLF at beginning
                            lineBreakIndex = crIndex;
                            iterator.lineBreakLength = 2;
                        } else {
                            // CR only at beginning
                            lineBreakIndex = crIndex;
                            iterator.lineBreakLength = 1;
                        }
                    } else {
                        // rare scenario: view length is 1 and the content is CR, CR is not only the first byte but also the last byte
                        // do MERGEALL first since not sure the linebreak is CR or CRLF
                        endsWithCR = true;
                        mergeAll = true;
                    }
                } else {
                    // no CR in the view or LF is hit before CR
                    if (lfIndex > 0) {
                        // LF is in the middle or end, no need to check the CRLF scenario since no CR is found before LF postion
                        lineBreakIndex = lfIndex;
                        iterator.lineBreakLength = 1;
                    } else if (lfIndex === 0) {
                        // LF is the first byte, need to check if the last byte of lineView is CR
                        iterator.lineBreakLength = iterator.lastViewEndsWithCR ? 2 : 1;
                        iterator.hitLine(iterator.lastViewEndsWithCR ? iterator.lineView.slice(0, iterator.lineView.length - 1) : iterator.lineView);
                        if (iterator.shouldBreak()) {
                            break;
                        }
                        iterator.lineView = new Uint8Array(0);
                        view = new Uint8Array(<ArrayBuffer>this.fr.result, 1 + view.byteOffset);
                        iterator.lastViewEndsWithCR = false;
                        continue;
                    } else {
                        // no LF found
                        mergeAll = true;
                    }
                }
                if (!mergeAll) {
                    if (iterator.lastViewEndsWithCR) {
                        // lineView is like: ****CR, just treat **** as a new line, no need to check if the current view starts with LF since it is handled by LF first byte scenario
                        iterator.hitLine(iterator.lineView.slice(0, iterator.lineView.length - 1));
                        if (iterator.shouldBreak()) {
                            break;
                        }

                        // treat the view as a new line
                        iterator.hitLine(view.slice(0, lineBreakIndex));
                        if (iterator.shouldBreak()) {
                            break;
                        }
                        // reset lastViewEndsWithCR to prevent it being treated again for next view
                        iterator.lastViewEndsWithCR = false;
                    } else {
                        // merge the view line into lineView
                        iterator.lineView = mergeUint8Array(iterator.lineView, view.slice(0, lineBreakIndex));
                        // treat the lineView as a whole line
                        iterator.hitLine(iterator.lineView);
                        if (iterator.shouldBreak()) {
                            break;
                        }
                    }
                    // clear lineView
                    iterator.lineView = new Uint8Array(0);
                    // remove the processed view
                    view = new Uint8Array(<ArrayBuffer>this.fr.result, view.byteOffset + lineBreakIndex + iterator.lineBreakLength);
                } else {
                    // do merge all, which means no CR or LF found
                    if (iterator.lastViewEndsWithCR) {
                        // lineView is like: ****CR, just treat **** as a new line
                        iterator.lineBreakLength = 1;
                        iterator.hitLine(iterator.lineView.slice(0, iterator.lineView.length - 1));
                        if (iterator.shouldBreak()) {
                            break;
                        }
                        // clear lineView
                        iterator.lineView = new Uint8Array(0);
                    }
                    // merge the view to lineView
                    iterator.lineView = mergeUint8Array(iterator.lineView, view);
                    iterator.lastViewEndsWithCR = endsWithCR;
                    break;  // break the while as all rest view is processed
                }
            }

            // if (!iterator.isPartialIterate()) {
            //     let progress: number = Math.round(iterator.offset / this.file.size * 10000) / 100;
            //     respondMessage(createProgressResponseMessage(progress < 100 ? progress : 100));
            // }

            iterator.lineBreakLength = 0;
            if (this.iterator.isSporadicIterate) {
                this.seekSporadic();
            } else {
                iterator.offset += this.CHUNK_SIZE;
                this.seek();
            }
        };
        this.iterator = new Iterator();
        this.iterator.buildIndex = true;
        this.iterator.indexSize = Math.round(file.size / 1000);
        if (sniffConfig) {
            if (sniffConfig.lineNumber < 1) {
                respondMessage(new ResponseMessage(false, 'Sniff line number is invalid.'));
                return;
            }
            this.sniffLines = [];
            this.iterator.linesToIterate = sniffConfig.lineNumber;
            this.iterator.buildIndex = false;
        }
        this.iterator.endOffset = this.file.size;
        if (onNewLineConfig) {
            this.iterator.bindEachLineFromConfig(this.stringToFunction(onNewLineConfig));
        }
        this.iterateLinesInternal((line: Uint8Array) => {
            if (!sniffConfig) {
                this.lineCount++;
            } else {
                this.sniffLines.push(sniffConfig.decode ? utf8decoder.decode(line) : line);
            }
        }, () => {
            if (!sniffConfig) {
                this.linesIndex = this.iterator.linesIndex;
                console.log('linesIndex: ', this.linesIndex);
                let result: any = {
                    lineCount: this.lineCount
                };
                if (onNewLineConfig) {
                    result.scope = this.removeFunctionsFromObject(this.iterator.eachLineScope);
                }
                respondMessage(new ResponseMessage(result));
            } else {
                // sniff complete
                respondMessage(new ResponseMessage(this.sniffLines));
                this.sniffLines = [];
                delete this.sniffLines;
                sniffWorker = null;
            }
        });
    }

    private setPartialIterator(start: number, count: number) {
        if (start < 1 || start > this.lineCount) {
            respondMessage(new ResponseMessage(false, 'Start line number is invalid'));
            return false;
        } else if (count < 1) {
            respondMessage(new ResponseMessage(false, 'Count is invalid'));
            return false;
        } else {
            let endLineNumber: number = start + count - 1;
            endLineNumber = endLineNumber > this.lineCount ? this.lineCount : endLineNumber;
            // for (let i: number = 0; i < this.linesIndex.length; i++) {
            //     if (start >= this.linesIndex[i].line && (i === this.linesIndex.length - 1 || start < this.linesIndex[i + 1].line)) {
            //         this.iterator.offset = this.linesIndex[i].offset;
            //         this.iterator.currentLineNumber = this.linesIndex[i].line;
            //     }
            //     if (endLineNumber < this.linesIndex[i].line && (i === 0 || endLineNumber >= this.linesIndex[i - 1].line)) {
            //         this.iterator.endOffset = this.linesIndex[i].offset;
            //     } else {
            //         this.iterator.endOffset = this.file.size;
            //     }
            // }
            this.iterator.linesToIterate = count;
            this.iterator.startLineNumber = start;
            return true;
        }
    }

    private iterateLinesInternal(onNewLineFunc: (this: Iterator, lineDate: Uint8Array) => void, onSeekComplete?: (this: Iterator) => void) {
        this.iterator.onEachLineInternal = onNewLineFunc;
        if (onSeekComplete) {
            this.iterator.onSeekComplete = onSeekComplete;
        }
        this.seek();
    }

    private _iterateLines(config: IIteratorConfigMessage, start: number | null, count: number | null, onSeekComplete: () => void) {
        let _this = this;
        this.iterator.offset = 0;
        this.iterator.endOffset = this.file.size;
        this.iterator.bindEachLineFromConfig(config);
        this.iterator.onSeekComplete = function () {
            this.eachLineScope = _this.removeFunctionsFromObject(this.eachLineScope);
            onSeekComplete();
        }
        if (start !== null && count !== null) {
            if (this.setPartialIterator(start, count)) {
                this.seek();
            } else {
                return;
            }
        } else {
            this.seek();
        }
    }

    private removeFunctionsFromObject(obj: any) {
        if (typeof obj === 'object') {
            for (let i in obj) {
                if (typeof obj[i] === 'function') {
                    delete obj[i];
                } else if (typeof obj[i] === 'object') {
                    this.removeFunctionsFromObject(obj[i]);
                }
            }
        }
        return obj;
    }

    private stringToFunction(config: IIteratorConfigMessage): IIteratorConfigMessage {
        let functionMap = config.functionMap;
        if (functionMap.length) {
            for (let i = 0; i < functionMap.length; i++) {
                let functionString = eval(`config.scope${functionMap[i]}.toString()`);
                eval(`config.scope${functionMap[i]}=${functionString}`);
            }
        }
        return config;
    }

    public iterateLines(data: IIterateLinesConfig) {
        let config: IIteratorConfigMessage = this.stringToFunction(data.config);
        this._iterateLines(config, data.start, data.count, () => {
            respondMessage(new ResponseMessage(this.iterator.eachLineScope));
        });
    }

    public setSporadicIterator(linesRanges: LinesRanges) {
        linesRanges = this.sortAndMergeLineMap(linesRanges);
        let sporadicTotal = 0;
        for (let i = 0; i < linesRanges.length; i++) {
            if (typeof linesRanges[i] === 'number') {
                sporadicTotal++;
            } else {
                sporadicTotal += getLinesRangeCount(<LinesRange>linesRanges[i]);
            }
        }
        this.iterator.linesToIterate = sporadicTotal;
        this.iterator.endOffset = this.file.size;
        this.iterator.isSporadicIterate = true;
        this.iterator.linesRanges = linesRanges;
        this.seekSporadic();
    }

    public getSporadicLines(linesRanges: LinesRanges, decode: boolean) {
        linesRanges = this.sortAndMergeLineMap(linesRanges);
        let result: IGetSporadicLinesResult[] = [];
        this.iterator.onEachLineInternal = function (line: Uint8Array) {
            result.push({
                lineNumber: this.currentLineNumber,
                value: decode ? utf8decoder.decode(line) : line
            });
        };
        this.iterator.onSeekComplete = function () {
            respondMessage(new ResponseMessage(result));
        }
        this.setSporadicIterator(linesRanges);
    }

    public iterateSporadicLines(config: IIteratorConfigMessage, linesRanges: LinesRanges) {
        linesRanges = this.sortAndMergeLineMap(linesRanges);
        config = this.stringToFunction(config);
        let _this = this;
        this.iterator.bindEachLineFromConfig(config);
        this.iterator.onSeekComplete = function () {
            this.eachLineScope = _this.removeFunctionsFromObject(this.eachLineScope);
            respondMessage(new ResponseMessage(this.eachLineScope));
        }
        this.setSporadicIterator(linesRanges);
    }

    private seek() {
        let finishDueToLinesToIterateReached: boolean = this.iterator.linesToIterate > 0 && this.iterator.linesProcessed === this.iterator.linesToIterate
        if (this.iterator.offset >= this.iterator.endOffset || finishDueToLinesToIterateReached) {
            respondMessage(createProgressResponseMessage(100));
            if (this.iterator.lineView.byteLength && !finishDueToLinesToIterateReached) {
                this.iterator.hitLine(this.iterator.lineView);
                this.iterator.lineView = new Uint8Array(0);
            }
            if (this.iterator.onSeekComplete) {
                this.iterator.onSeekComplete.call(this.iterator);
            }
            this.iterator = new Iterator();
        } else {
            let slice: Blob = this.file.slice(this.iterator.offset, this.iterator.offset + this.CHUNK_SIZE);
            this.fr.readAsArrayBuffer(slice);
        }
    }

    private seekSporadic() {
        if (this.iterator.sporadicProcessed === this.iterator.linesToIterate) {
            complete.call(this);
        } else {
            let first = this.iterator.linesRanges[0];
            let start = typeof first === 'number' ? first : first.start;
            if (this.iterator.lineView.byteLength && this.iterator.currentLineNumber === start) {
                this.iterator.offset += this.CHUNK_SIZE;
                if (this.iterator.offset >= this.iterator.endOffset) {
                    this.iterator.hitLine(this.iterator.lineView);
                    this.iterator.lineView = new Uint8Array(0);
                    if (this.iterator.sporadicProcessed === this.iterator.linesToIterate) {
                        complete.call(this);
                    }
                } else {
                    let slice: Blob = this.file.slice(this.iterator.offset, this.iterator.offset + this.CHUNK_SIZE);
                    this.fr.readAsArrayBuffer(slice);
                    return;
                }
            } else if (this.iterator.linesRanges.length > 0) {
                // for (let i = 0; i < this.linesIndex.length; i++) {
                //     let mapStart = this.linesIndex[i].line;
                //     let mapEnd = i === this.linesIndex.length - 1 ? this.lineCount : this.linesIndex[i + 1].line - 1;
                //     if (start >= mapStart && start <= mapEnd) {
                //         let offset = this.linesIndex[i].offset;
                //         this.iterator.offset = offset;
                //         let slice: Blob = this.file.slice(offset, offset + this.CHUNK_SIZE);
                //         this.iterator.currentLineNumber = this.linesIndex[i].line;
                //         this.fr.readAsArrayBuffer(slice);
                //         return;
                //     }
                // }
                // out of range
                complete.call(this);
            }
        }

        function complete(this: TxtReaderWorker) {
            respondMessage(createProgressResponseMessage(100));
            if (this.iterator.onSeekComplete) {
                this.iterator.onSeekComplete.call(this.iterator);
            }
            this.iterator = new Iterator();
        }
    }

    private _getLines(start: number, count: number, onSeekCompleteFunc: (lines: Uint8Array[], linesBuffer: ArrayBuffer[]) => void): void {
        if (this.setPartialIterator(start, count)) {
            let lines: Uint8Array[] = [];
            let linesBuffer: ArrayBuffer[] = [];
            this.iterateLinesInternal((line: Uint8Array) => {
                lines.push(line);
                if (useTransferrable) {
                    linesBuffer.push(line.buffer);
                }
            }, () => {
                setTimeout(() => {
                    onSeekCompleteFunc(lines, linesBuffer);
                }, 0);
            });
        }
    }

    public getLines(start: number, count: number): void {
        this._getLines(start, count, (lines, linesBuffer) => {
            if (useTransferrable) {
                respondTransferrableMessage(new ResponseMessage(lines), linesBuffer);
            } else {
                respondMessage(new ResponseMessage(lines));
            }
        });
    }

    public getLines2(linesRanges: LinesRanges): void {
        this.iterator = new Iterator();
        this.iterator.setRanges(linesRanges, this.linesIndex);
        console.log(this.linesIndex);
        debugger;
    }

    private sortAndMergeLineMap(lineMap: LinesRanges): LinesRanges {
        lineMap.sort(function (a, b) {
            // sort lines in ascending order
            if (typeof a === 'number' && typeof b === 'number') {
                return a > b ? 1 : -1;
            } else if (typeof a === 'number' && typeof b === 'object') {
                return a > b.start ? 1 : -1;
            } else if (typeof a === 'object' && typeof b === 'number') {
                return a.start > b ? 1 : -1;
            } else if (typeof a === 'object' && typeof b === 'object') {
                return a.start > b.start ? 1 : -1;
            }
            return 0;
        });
        for (let i = 1; i < lineMap.length; i++) {
            // compare lines[i] with lines[i-1]
            let prev = lineMap[i - 1];
            let current = lineMap[i];
            if (typeof current === 'number' && typeof prev === 'number') {
                if (current === prev) {
                    // duplicate line number, remove current one
                    lineMap.splice(i, 1);
                    i--;
                } else if (current === prev + 1) {
                    lineMap[i - 1] = {
                        start: prev,
                        end: current
                    }
                    lineMap.splice(i, 1);
                    i--;
                }
            } else if (typeof current === 'number' && typeof prev === 'object') {
                let prevEnd = prev.end;
                if (isLineWithinLinesRange(current, prev)) {
                    lineMap.splice(i, 1);
                    i--;
                } else if (current === prevEnd + 1) {
                    prev.end = current;
                    lineMap.splice(i, 1);
                    i--;
                }
            } else if (typeof current === 'object' && typeof prev === 'number') {
                if (isLineWithinLinesRange(prev, current)) {
                    lineMap.splice(i - 1, 1);
                    i--;
                }
            } else if (typeof current === 'object' && typeof prev === 'object') {
                let currentEnd = current.end;
                let prevEnd = prev.end;
                if (prevEnd >= current.start && prevEnd <= currentEnd) {
                    // overlap, remove the prev one
                    current.start = prev.start;
                    lineMap.splice(i - 1, 1);
                    i--;
                } else if (current.start >= prev.start && currentEnd <= prevEnd) {
                    // current within prev range, delete current
                    lineMap.splice(i, 1);
                    i--;
                } else if (current.start === prevEnd + 1) {
                    prev.end = currentEnd;
                    lineMap.splice(i, 1);
                    i--;
                }
            }
        }
        return lineMap;
    }
}