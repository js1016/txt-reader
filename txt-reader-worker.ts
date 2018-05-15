import { TextDecoder } from './text-encoding'
import './polyfill'
import { IRequestMessage, IResponseMessage, IIteratorConfigMessage } from './txt-reader-common'

interface ILinePosition {
    line: number;
    offset: number;
}

interface IIterateLinesConfig {
    config: IIteratorConfigMessage;
    start: number;
    count: number;
}

const utf8decoder = new TextDecoder('utf-8');

let DEFAULT_CHUNK_SIZE: number = 1024 * 1024 * 50;

let currentTaskId: number = null;

let txtReaderWorker: TxtReaderWorker = null;

let verboseLogging: boolean = false;

const useTransferrable: boolean = navigator.userAgent.indexOf('Firefox') > -1;

const respondMessage = (responseMessage: ResponseMessage): void => {
    if (responseMessage.done) {
        currentTaskId = null;
    }
    postMessage.apply(null, [responseMessage]);
};

const respondTransferrableMessage = (responseMessage: ResponseMessage, arr): void => {
    if (responseMessage.done) {
        currentTaskId = null;
    }
    postMessage.apply(null, [responseMessage, arr]);
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
                txtReaderWorker.getLines(req.data.start, req.data.count);
            }
            break;
        case 'iterateLines':
            if (validateWorker()) {
                txtReaderWorker.iterateLines(req.data)
            }
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
        this.taskId = currentTaskId;
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
    public onEachLineInternal: Function;

    // onSeekComplete callback function
    public onSeekComplete: Function;

    // external onEachLine callback function
    private onEachLine: Function;

    // external onEachLine scope
    public eachLineScope: Object;

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

    private processedViewLength: number;

    public lineBreakLength: number;

    // last progress
    private lastProgress: number;

    public map: ILinePosition[];

    private lastMappedProgress: number;

    constructor() {
        this.lineView = new Uint8Array(0);
        this.lastViewEndsWithCR = false;
        this.onEachLineInternal = null;
        this.onEachLine = null;
        this.eachLineScope = null;
        this.onSeekComplete = null;
        this.offset = 0;
        this.createMap = false;
        this.endOffset = null;
        this.linesToIterate = 0;
        this.linesProcessed = 0;
        this.currentLineNumber = 1;
        this.startLineNumber = 0;
        this.lastProgress = null;
        this.processedViewLength = 0;
        this.lineBreakLength = 0;
        this.map = [];
        this.lastMappedProgress = null;
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
                progress = Math.round(this.linesProcessed / this.linesToIterate * 10000) / 100;
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

    public shouldReportProgress(currentProgress): boolean {
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
        this.eachLineScope = config.scope;
        this.eachLineScope['decode'] = (value: Uint8Array): string => {
            return utf8decoder.decode(value);
        }
    }
}

class TxtReaderWorker {
    public CHUNK_SIZE: number;
    private file: File;
    private fr: FileReader;
    private quickSearchMap: ILinePosition[];
    private iterator: Iterator;
    private lineCount: number;

    constructor(file: File, onNewLineConfig?: IIteratorConfigMessage) {
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
            let view: Uint8Array = new Uint8Array(this.fr.result);
            let viewTotalLength: number = this.fr.result.byteLength;
            let iterator: Iterator = this.iterator;
            while (view.length > 0) {
                // first CR (0x0D, \r) position in the view
                let crIndex: number = view.indexOf(13);
                // first LF (0x0A, \n) position in the view
                let lfIndex: number = view.indexOf(10);
                // for CRLF linebreakLength would be 2, otherwise the value would be 1.
                let lineBreakIndex: number;
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
                        view = new Uint8Array(this.fr.result, 1 + view.byteOffset);
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
                    view = new Uint8Array(this.fr.result, view.byteOffset + lineBreakIndex + iterator.lineBreakLength);
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
        this.iterator.endOffset = this.file.size;
        if (onNewLineConfig) {
            this.iterator.bindEachLineFromConfig(onNewLineConfig);
        }
        this.iterateLinesInternal((line: Uint8Array, progress: number) => {
            this.lineCount++;
        }, () => {
            this.quickSearchMap = this.iterator.map;
            let result: any = {
                lineCount: this.lineCount
            };
            if (onNewLineConfig) {
                delete this.iterator.eachLineScope['decode'];
                result.scope = this.iterator.eachLineScope;
            }
            respondMessage(new ResponseMessage(result));
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

    public iterateLines(data: IIterateLinesConfig) {
        let config: IIteratorConfigMessage = data.config;
        this.iterator.offset = 0;
        this.iterator.endOffset = this.file.size;
        this.iterator.bindEachLineFromConfig(config);
        this.iterator.onSeekComplete = () => {
            delete this.iterator.eachLineScope['decode'];
            respondMessage(new ResponseMessage(this.iterator.eachLineScope));
        }
        if (data.start !== null && data.count !== null) {
            let setResult: boolean = this.setPartialIterator(data.start, data.count);
            if (!setResult) {
                return;
            }
        }
        this.seek();
    }

    private seek() {
        let finishDueToLinesToIterateReached: boolean = this.iterator.linesToIterate > 0 && this.iterator.linesProcessed === this.iterator.linesToIterate
        if (this.iterator.offset >= this.iterator.endOffset || finishDueToLinesToIterateReached) {
            respondMessage(createProgressResponseMessage(100));
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

    public getLines(start: number, count: number) {
        if (this.setPartialIterator(start, count)) {
            let lines: Uint8Array[] = [];
            let linesBuffer: ArrayBuffer[] = [];
            this.iterateLinesInternal((line: Uint8Array) => {
                lines.push(line);
                if (useTransferrable) {
                    linesBuffer.push(line.buffer);
                }
            }, () => {
                if (useTransferrable) {
                    respondTransferrableMessage(new ResponseMessage(lines), linesBuffer);
                } else {
                    respondMessage(new ResponseMessage(lines));
                }
            });
        }
    }
}
