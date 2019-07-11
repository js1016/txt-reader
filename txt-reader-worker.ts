import { TextDecoder } from 'text-encoding-shim'
import './polyfill'
import { IRequestMessage, IResponseMessage, IIteratorConfigMessage, LinesRange, SporadicLinesMap, IGetSporadicLinesResult, SporadicLineItem } from './txt-reader-common'

interface ILinePosition {
    line: number;
    offset: number;
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

let DEFAULT_CHUNK_SIZE: number = 1024 * 1024 * 50;

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
    let linesEnd = getLinesRangeEnd(linesRange);
    return line >= linesRange.start && line <= linesEnd;
};

let getLinesRangeEnd = (linesRange: LinesRange): number => {
    return linesRange.count !== undefined ? linesRange.start + linesRange.count - 1 : linesRange.end;
};

let getLinesRangeCount = (linesRange: LinesRange): number => {
    return linesRange.count !== undefined ? linesRange.count : linesRange.end - linesRange.start + 1;
}

let getStartCountForSporadicLineItem = (item: SporadicLineItem): { start: number, count: number } => {
    if (typeof item === 'number') {
        return {
            start: item,
            count: 1
        }
    } else {
        if (item.end !== undefined) {
            return {
                start: item.start,
                count: item.end - item.start + 1
            }
        } else {
            return item;
        }
    }
}

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
        case 'getSporadicLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).getSporadicLines(req.data.sporadicLinesMap, req.data.decode);
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
    public onEachLineInternal: Function | null;

    // onSeekComplete callback function
    public onSeekComplete: Function | null;

    // external onEachLine callback function
    private onEachLine: Function | null;

    // external onEachLine scope
    public eachLineScope: any;

    // seek offset
    public offset: number;

    // whether to create quicksearchmap, default to false
    public createMap: boolean;

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

    // total line number of sporadicLinesMap
    public sporadicTotal: number;

    // processed sporadic lines
    public sporadicProcessed: number;

    private processedViewLength: number;

    public lineBreakLength: number;

    // last progress
    public lastProgress: number | null;

    public map: ILinePosition[];

    private lastMappedProgress: number | null;

    constructor() {
        this.lineView = new Uint8Array(0);
        this.lastViewEndsWithCR = false;
        this.onEachLineInternal = null;
        this.onEachLine = null;
        this.eachLineScope = null;
        this.onSeekComplete = null;
        this.offset = 0;
        this.createMap = false;
        this.endOffset = 0;
        this.linesToIterate = 0;
        this.linesProcessed = 0;
        this.currentLineNumber = 1;
        this.startLineNumber = 0;
        this.lastProgress = null;
        this.processedViewLength = 0;
        this.lineBreakLength = 0;
        this.map = [];
        this.lastMappedProgress = null;
        this.sporadicProcessed = 0;
        this.sporadicTotal = 0;
    }

    public shouldBreak(): boolean {
        if (this.isPartialIterate() && this.linesProcessed === this.linesToIterate) {
            return true;
        } else {
            return false;
        }
    }

    public isPartialIterate(): boolean {
        return this.linesToIterate > 0;
    }

    public hitLine(lineData: Uint8Array): void {
        let isPartialIterate: boolean = this.isPartialIterate();
        let progress = 0;
        if (!isPartialIterate ||
            (isPartialIterate && this.currentLineNumber >= this.startLineNumber)) {
            this.linesProcessed++;
            if (isPartialIterate) {
                if (this.sporadicTotal === 0) {
                    progress = Math.round(this.linesProcessed / this.linesToIterate * 10000) / 100;
                } else {
                    progress = Math.round((this.sporadicProcessed + this.linesProcessed) / this.sporadicTotal * 10000) / 100;
                }
            } else {
                progress = Math.round(this.processedViewLength / this.endOffset * 10000) / 100;
            }
            if (this.createMap) {
                let currentProgress: number = Math.round(progress);
                if (this.lastMappedProgress === null ||
                    this.lastMappedProgress < currentProgress) {
                    this.lastMappedProgress = currentProgress;
                    this.map.push({
                        line: this.currentLineNumber,
                        offset: this.processedViewLength
                    });
                }
            }
            if (this.onEachLineInternal !== null) {
                if (lineData.buffer.byteLength != lineData.byteLength) {
                    lineData = new Uint8Array(lineData);
                }
                this.onEachLineInternal.call(self, lineData, progress);
            }
            if (this.onEachLine !== null) {
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
        if (this.lastProgress === null) {
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

class TxtReaderWorker {
    public CHUNK_SIZE!: number;
    private file!: File;
    private fr!: FileReader;
    private quickSearchMap!: ILinePosition[];
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
        this.quickSearchMap = [];
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

            if (!iterator.isPartialIterate()) {
                let progress: number = Math.round(iterator.offset / this.file.size * 10000) / 100;
                respondMessage(createProgressResponseMessage(progress < 100 ? progress : 100));
            }

            iterator.offset += this.CHUNK_SIZE;
            iterator.lineBreakLength = 0;
            this.seek();
        };
        this.iterator = new Iterator();
        this.iterator.createMap = true;
        if (sniffConfig) {
            this.sniffLines = [];
            this.iterator.linesToIterate = sniffConfig.lineNumber;
            this.iterator.createMap = false;
        }
        this.iterator.endOffset = this.file.size;
        if (onNewLineConfig) {
            this.iterator.bindEachLineFromConfig(this.stringToFunction(onNewLineConfig));
        }
        this.iterateLinesInternal((line: Uint8Array, progress: number) => {
            if (!sniffConfig) {
                this.lineCount++;
            } else {
                this.sniffLines.push(sniffConfig.decode ? utf8decoder.decode(line) : line);
            }
        }, () => {
            if (!sniffConfig) {
                this.quickSearchMap = this.iterator.map;
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
        } else {
            let endLineNumber: number = start + count - 1;
            endLineNumber = endLineNumber > this.lineCount ? this.lineCount : endLineNumber;
            for (let i: number = 0; i < this.quickSearchMap.length; i++) {
                if (start >= this.quickSearchMap[i].line && (i === this.quickSearchMap.length - 1 || start < this.quickSearchMap[i + 1].line)) {
                    this.iterator.offset = this.quickSearchMap[i].offset;
                    this.iterator.currentLineNumber = this.quickSearchMap[i].line;
                }
                if (endLineNumber < this.quickSearchMap[i].line && (i === 0 || endLineNumber >= this.quickSearchMap[i - 1].line)) {
                    this.iterator.endOffset = this.quickSearchMap[i].offset;
                } else {
                    this.iterator.endOffset = this.file.size;
                }
            }
            this.iterator.linesToIterate = count;
            this.iterator.startLineNumber = start;
            return true;
        }
    }

    private iterateLinesInternal(onNewLineFunc: Function, onSeekCompleteFunc?: Function) {
        this.iterator.onEachLineInternal = onNewLineFunc;
        this.iterator.onSeekComplete = onSeekCompleteFunc || null;
        this.seek();
    }

    private _iterateLines(config: IIteratorConfigMessage, start: number | null, count: number | null, onSeekCompleteFunc: () => void) {
        this.iterator.offset = 0;
        this.iterator.endOffset = this.file.size;
        this.iterator.bindEachLineFromConfig(config);
        this.iterator.onSeekComplete = () => {
            if (!this.iterator.sporadicTotal) {
                this.iterator.eachLineScope = this.removeFunctionsFromObject(this.iterator.eachLineScope);
            }
            onSeekCompleteFunc();
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

    public iterateSporadicLines(config: IIteratorConfigMessage, sporadicLinesMap: SporadicLinesMap) {
        let tempScope: any = null;
        config = this.stringToFunction(config);
        sporadicLinesMap = this.sortAndMergeLineMap(sporadicLinesMap);
        let sporadicTotal = 0;
        let processedCount = 0;
        for (let i = 0; i < sporadicLinesMap.length; i++) {
            if (typeof sporadicLinesMap[i] === 'number') {
                sporadicTotal++;
            } else {
                sporadicTotal += getLinesRangeCount(<LinesRange>sporadicLinesMap[i]);
            }
        }
        let process = (index: number) => {
            let item = getStartCountForSporadicLineItem(sporadicLinesMap[index]);
            this.iterator.sporadicTotal = sporadicTotal;
            this.iterator.sporadicProcessed = processedCount;
            this.iterator.lastProgress = Math.round(processedCount / sporadicTotal * 10000) / 100;
            this.iterator.eachLineScope = tempScope;
            this._iterateLines(config, item.start, item.count, () => {
                processedCount += item.count;
                tempScope = this.iterator.eachLineScope;
                if (index < sporadicLinesMap.length - 1) {
                    setTimeout(() => {
                        process(index + 1);
                    }, 0);
                } else {
                    respondMessage(new ResponseMessage(this.removeFunctionsFromObject(tempScope)));
                }
            });
        }
        process(0);
    }

    private seek() {
        let finishDueToLinesToIterateReached: boolean = this.iterator.linesToIterate > 0 && this.iterator.linesProcessed === this.iterator.linesToIterate
        if (this.iterator.offset >= this.iterator.endOffset || finishDueToLinesToIterateReached) {
            if (this.iterator.sporadicTotal === 0 || this.iterator.sporadicProcessed + this.iterator.linesProcessed === this.iterator.sporadicTotal) {
                respondMessage(createProgressResponseMessage(100));
            }
            if (this.iterator.lineView.byteLength && !finishDueToLinesToIterateReached) {
                this.iterator.hitLine(this.iterator.lineView);
                this.iterator.lineView = new Uint8Array(0);
            }
            if (this.iterator.onSeekComplete !== null) {
                this.iterator.onSeekComplete.call(self);
            }
            this.iterator = new Iterator();
        } else {
            let slice: Blob = this.file.slice(this.iterator.offset, this.iterator.offset + this.CHUNK_SIZE);
            this.fr.readAsArrayBuffer(slice);
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

    public getSporadicLines(sporadicLinesMap: SporadicLinesMap, decode: boolean) {
        sporadicLinesMap = this.sortAndMergeLineMap(sporadicLinesMap);
        let sporadicTotal = 0;
        for (let i = 0; i < sporadicLinesMap.length; i++) {
            if (typeof sporadicLinesMap[i] === 'number') {
                sporadicTotal++;
            } else {
                sporadicTotal += getLinesRangeCount(<LinesRange>sporadicLinesMap[i]);
            }
        }
        let result: IGetSporadicLinesResult[] = [];
        let process = (index: number) => {
            let item = getStartCountForSporadicLineItem(sporadicLinesMap[index]);
            this.iterator.sporadicTotal = sporadicTotal;
            this.iterator.sporadicProcessed = result.length;
            this.iterator.lastProgress = Math.round(result.length / sporadicTotal * 10000) / 100;
            this._getLines(item.start, item.count, lines => {
                for (let i = 0; i < lines.length; i++) {
                    result.push({
                        lineNumber: item.start + i,
                        value: decode ? utf8decoder.decode(lines[i]) : lines[i]
                    });
                }
                if (index < sporadicLinesMap.length - 1) {
                    process(index + 1);
                } else {
                    respondMessage(new ResponseMessage(result));
                }
            });
        }
        process(0);
    }

    private sortAndMergeLineMap(lineMap: SporadicLinesMap): SporadicLinesMap {
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
                let prevEnd = getLinesRangeEnd(prev);
                if (isLineWithinLinesRange(current, prev)) {
                    lineMap.splice(i, 1);
                    i--;
                } else if (current === prevEnd + 1) {
                    if (prev.count !== undefined) {
                        prev.count++;
                    } else {
                        prev.end = current;
                    }
                    lineMap.splice(i, 1);
                    i--;
                }
            } else if (typeof current === 'object' && typeof prev === 'number') {
                if (isLineWithinLinesRange(prev, current)) {
                    lineMap.splice(i - 1, 1);
                    i--;
                }
            } else if (typeof current === 'object' && typeof prev === 'object') {
                let currentEnd = getLinesRangeEnd(current);
                let prevEnd = getLinesRangeEnd(prev);
                if (prevEnd >= current.start && prevEnd <= currentEnd) {
                    // overlap, remove the prev one
                    current.start = prev.start;
                    if (current.count !== undefined) {
                        current.count = currentEnd - current.start + 1;
                    }
                    lineMap.splice(i - 1, 1);
                    i--;
                } else if (current.start >= prev.start && currentEnd <= prevEnd) {
                    // current within prev range, delete current
                    lineMap.splice(i, 1);
                    i--;
                } else if (current.start === prevEnd + 1) {
                    if (prev.count !== undefined) {
                        prev.count += currentEnd - current.start + 1;
                    } else {
                        prev.end = currentEnd;
                    }
                    lineMap.splice(i, 1);
                    i--;
                }
            }
        }
        return lineMap;
    }
}