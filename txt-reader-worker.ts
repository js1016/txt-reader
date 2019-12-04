import { TextDecoder } from 'text-encoding-shim'
import './polyfill'
import { IRequestMessage, IResponseMessage, IIteratorConfigMessage, LinesRange, LinesRanges, IGetSporadicLinesResult, ISeekRange, GetLineItem } from './txt-reader-common'
import { start } from 'repl';

interface ILineIndexRange {
    start: number;
    end: number;
    startLine: number;
    endLine: number;
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

let getStart = (linesRange: LinesRange | number): number => {
    return typeof linesRange === 'number' ? linesRange : linesRange.start;
};

let getEnd = (linesRange: LinesRange | number): number => {
    return typeof linesRange === 'number' ? linesRange : linesRange.end;
};

let getCount = (linesRange: LinesRange | number): number => {
    return typeof linesRange === 'number' ? 1 : linesRange.end - linesRange.start + 1;
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
            DEFAULT_CHUNK_SIZE = req.data;
            respondMessage(new ResponseMessage(DEFAULT_CHUNK_SIZE));
            break;
        case 'getLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).getLines(req.data);
                break;
            }
        case 'iterateLines':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker).iterateLines(req.data)
            }
            break;
        case 'sniffLines':
            sniffWorker = new TxtReaderWorker(req.data.file, undefined, {
                lineNumber: req.data.lineNumber,
                decode: req.data.decode
            });
            break;
        case '_testRanges':
            if (validateWorker()) {
                (<TxtReaderWorker>txtReaderWorker)._testRanges(req.data);
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
    public lineView: Uint8Array = new Uint8Array(0);

    // whether last view ends with CR
    public lastViewEndsWithCR: boolean = false;

    // onEachLine callback function for internal methods
    // internal methods like: loadFile, getLines have their own onEachLine callback
    public onEachLineInternal: ((this: Iterator, lineDate: Uint8Array) => void) | null = null;

    // onSeekComplete callback function
    public onSeekComplete!: (this: Iterator) => void;

    // external onEachLine callback function
    private onEachLine: Function | null = null;

    // external onEachLine scope
    public eachLineScope: any = null;

    // seek offset
    public offset: number = 0;

    // whether to build index, default to false
    public buildIndex: boolean = false;

    // size of each index range
    public indexSize: number = 0;

    // seek destination offset
    public endOffset: number = 0;

    public fullIterate: boolean;

    // how many lines already processed
    public linesProcessed: number = 0;

    // current line number
    public currentLineNumber: number = 1;

    public seekRanges: ISeekRange[] = [];

    private currentSeekRange!: ISeekRange;

    private currentIterateRange: (LinesRange | number) | null = null;

    private processedViewLength: number = 0;

    public lineBreakLength: number = 0;

    public isGetLine: boolean = false;

    public getLineResult: GetLineItem[] = [];

    public lastGetLineItem: GetLineItem | null = null;

    public getLineNeedDecode: boolean = false;

    public expectLineNumber: number | null = null;

    private iterateProgress: number[] = [];

    // last progress
    public lastProgress: number = 0;

    public linesIndex: ILineIndexRange[] = [{
        start: 0,
        startLine: 1,
        end: 0,
        endLine: 0
    }];

    constructor(worker: TxtReaderWorker, linesRanges?: LinesRanges) {
        if (!linesRanges) {
            this.endOffset = worker.file.size;
            this.fullIterate = true;
        } else {
            this._setRanges(linesRanges, worker.linesIndex);
            this.fullIterate = false;
            if (this.seekRanges.length === 0) {
                respondMessage(new ResponseMessage(false, 'Invalid linesRanges'));
                return;
            }
            let startLine = this.seekRanges[0].startLine;
            let lastIterateRanges = this.seekRanges[this.seekRanges.length - 1].iterateRanges;
            let endLine = lastIterateRanges.length > 0 ? getEnd(lastIterateRanges[lastIterateRanges.length - 1]) : startLine;
            let totalLines = endLine - startLine + 1;
            if (totalLines <= 101) {
                for (let i = startLine; i <= endLine; i++) {
                    this.iterateProgress.push(i);
                }
            } else {
                let per = Math.round(totalLines / 100);
                let line = startLine;
                for (let i = 0; i < 101; i++) {
                    this.iterateProgress.push(line);
                    line += per;
                }
                if (this.iterateProgress[100] > endLine) {
                    this.iterateProgress[100] = endLine;
                }
            }
        }
    }

    public shouldBreak(): boolean {
        if (!this.fullIterate && this.currentSeekRange.iterateRanges.length === 0 && this.currentLineNumber > getEnd(this.currentIterateRange as LinesRange | number)) {
            return true;
        } else {
            return false;
        }
    }

    public seekNext(file: File): Blob {
        this.currentSeekRange = this.seekRanges[0];
        let slice = file.slice(this.currentSeekRange.start, this.currentSeekRange.end);
        this.currentLineNumber = this.currentSeekRange.startLine;
        this.iterateNext();
        //this.currentSeekMaxLine = getEnd(this.currentSeekRange.iterateRanges[this.currentSeekRange.iterateRanges.length - 1]);
        return slice;
    }

    private iterateNext() {
        if (this.currentSeekRange.iterateRanges.length) {
            this.currentIterateRange = this.currentSeekRange.iterateRanges.splice(0, 1)[0];
            this.expectLineNumber = getStart(this.currentIterateRange);
            if (this.isGetLine) {
                this.lastGetLineItem = {
                    range: this.currentIterateRange,
                    contents: []
                };
            }
        }
    }

    private _setRanges(iterateRanges: LinesRanges, linesIndex: ILineIndexRange[]) {
        let firstStart = getStart(iterateRanges[0]);
        let lastEnd = getEnd(iterateRanges[iterateRanges.length - 1]);
        if (firstStart > lastEnd) {
            iterateRanges.sort(function (prev, next) {
                let prevStart = getStart(prev);
                let nextEnd = getEnd(next);
                if (prevStart > nextEnd) {
                    return 1;
                } else {
                    return -1;
                }
            });
        }
        this.linesIndex = linesIndex;
        for (let i = 0; i < linesIndex.length; i++) {
            let index = linesIndex[i];
            for (let j = 0; j < iterateRanges.length; j++) {
                let range = iterateRanges[j];
                let hasOverlap = false;
                if (typeof range === 'number') {
                    if (range >= index.startLine && range <= index.endLine) {
                        hasOverlap = true;
                    }
                } else {
                    if (range.end >= index.startLine && range.start <= index.endLine) {
                        hasOverlap = true;
                    }
                }
                if (hasOverlap) {
                    let start = index.start;
                    let end = start + DEFAULT_CHUNK_SIZE;
                    let seekRange: ISeekRange = {
                        start: start,
                        startLine: index.startLine,
                        end: 0,
                        endLine: 0,
                        iterateRanges: []
                    };
                    let lastDelta: number = 0;
                    for (let k = i; k < linesIndex.length; k++) {
                        let delta = end - linesIndex[k].end;
                        if (k === i) {
                            if (delta <= 0 || i === linesIndex.length - 1) {
                                seekRange.end = linesIndex[k].end;
                                seekRange.endLine = linesIndex[k].endLine;
                                break;
                            } else {
                                lastDelta = delta;
                            }
                        } else if (k === linesIndex.length - 1) {
                            seekRange.end = linesIndex[k].end;
                            seekRange.endLine = linesIndex[k].endLine;
                            i = k;
                            break;
                        } else {
                            if (delta === 0) {
                                seekRange.end = linesIndex[k].end;
                                seekRange.endLine = linesIndex[k].endLine;
                                i = k;
                                break;
                            } else if (lastDelta > 0 && delta < 0) {
                                if (Math.abs(lastDelta) >= Math.abs(delta)) {
                                    seekRange.end = linesIndex[k].end;
                                    seekRange.endLine = linesIndex[k].endLine;
                                    i = k;
                                    break;
                                } else {
                                    seekRange.end = linesIndex[k - 1].end;
                                    seekRange.endLine = linesIndex[k - 1].endLine;
                                    i = k - 1;
                                    break;
                                }
                            } else {
                                lastDelta = delta;
                            }
                        }
                    }
                    setSeekIterateRanges(seekRange);
                    this.seekRanges.push(seekRange);
                    break;
                }
            }
        }
        function setSeekIterateRanges(seekRange: ISeekRange) {
            for (let i = 0; i < iterateRanges.length; i++) {
                let iterateRange = iterateRanges[i];
                let hasOverlap = false;
                if (typeof iterateRange === 'number') {
                    if (iterateRange >= seekRange.startLine && iterateRange <= seekRange.endLine) {
                        hasOverlap = true;
                    }
                } else {
                    if (iterateRange.end >= seekRange.startLine && iterateRange.start <= seekRange.endLine) {
                        hasOverlap = true;
                        if (iterateRange.start < seekRange.startLine) {
                            let newRange: LinesRange | number = {
                                start: iterateRange.start,
                                end: seekRange.startLine - 1
                            };
                            if (newRange.start === newRange.end) {
                                newRange = newRange.start;
                            }
                            iterateRanges.splice(i, 0, newRange);
                            iterateRange.start = seekRange.startLine;
                            i++;
                        }
                        if (iterateRange.end > seekRange.endLine) {
                            let newRange: LinesRange | number = {
                                start: seekRange.endLine + 1,
                                end: iterateRange.end
                            };
                            if (newRange.start === newRange.end) {
                                newRange = newRange.start;
                            }
                            iterateRanges.splice(i + 1, 0, newRange);
                            iterateRange.end = seekRange.endLine;
                        }
                        if (iterateRange.start === iterateRange.end) {
                            iterateRanges[i] = iterateRange.start;
                            iterateRange = iterateRanges[i];
                        }
                    }
                }
                if (hasOverlap) {
                    mergeRange(iterateRange, seekRange.iterateRanges);
                }
            }
        }
        function mergeRange(range: number | LinesRange, iterateRanges: LinesRanges): void {
            let isNumber = typeof range === 'number';
            let rangeStart = getStart(range);
            let rangeEnd = getEnd(range);
            let lastIterateRange = iterateRanges.length ? iterateRanges[iterateRanges.length - 1] : null;
            if (lastIterateRange === null) {
                // first indexRange
                iterateRanges.push(range);
                return;
            } else {
                let lastEnd = getEnd(lastIterateRange);
                if (rangeStart > lastEnd + 1) {
                    // new range is greater than last iterate range end and is not continuous
                    // ex. [...,6] + [8 | {8,9}], just append range
                    iterateRanges.push(range);
                    return;
                } else if (rangeStart >= lastEnd) {
                    // new range is greater than or equal to last iterate range end
                    // 1: [...,6 | {5,6}] + 6 do nothing
                    // 2: [...,6] + {6,7} | 7 | {7,8} change last iterate range to object, set end to rangeEnd
                    // 3: [...,{5,6}] + {6,7} | 7 | {7,8} change last iterate range.end to rangeEnd
                    if (typeof lastIterateRange === 'number') {
                        if ((isNumber && rangeStart > lastEnd) || !isNumber) {
                            iterateRanges[iterateRanges.length - 1] = {
                                start: lastIterateRange,
                                end: rangeEnd
                            };
                        }
                        return;
                    } else {
                        if ((isNumber && rangeStart >= lastEnd) || !isNumber) {
                            lastIterateRange.end = rangeEnd;
                            return;
                        } else {
                            throw Error("Unhandled scenario 1");
                        }
                    }
                } else {
                    let i: number = 0;
                    // need to merge new range into a proper position
                    for (i = 0; i < iterateRanges.length; i++) {
                        let currentRange = iterateRanges[i];
                        let currentStart = getStart(currentRange);
                        let currentEnd = getEnd(currentRange);
                        if (isNumber) {
                            if (range < currentStart) {
                                if (range === currentStart - 1) {
                                    if (typeof currentRange === 'number') {
                                        iterateRanges[i] = {
                                            start: range,
                                            end: currentRange
                                        };
                                    } else {
                                        currentRange.start = range;
                                    }
                                } else {
                                    iterateRanges.splice(i, 0, range);
                                }
                                return;
                            } else if (range >= currentStart && range <= currentEnd) {
                                // range within certain range
                                // 6 -> [6,7] | [5,6] | [{4,7},{9,10}] | [{2,3},{5,7}]
                                return;
                            } else if (range > currentEnd) {
                                if (range === currentEnd + 1) {
                                    if (typeof currentRange === 'number') {
                                        iterateRanges[i] = {
                                            start: currentRange,
                                            end: range
                                        };
                                    } else {
                                        currentRange.end = range;
                                    }
                                    break;
                                } else {
                                    if (i === iterateRanges.length - 1) {
                                        iterateRanges.push(range);
                                        return;
                                    } else {
                                        continue;
                                    }
                                }
                            } else {
                                throw Error("Unhandled scenario 2");
                            }
                        } else {
                            if (rangeEnd < currentStart - 1) {
                                iterateRanges.splice(i, 0, range);
                                return;
                            } else if (rangeEnd === currentStart - 1) {
                                if (typeof currentRange === 'number') {
                                    iterateRanges[i] = {
                                        start: rangeStart,
                                        end: currentRange
                                    };
                                } else {
                                    currentRange.start = rangeStart;
                                }
                                return;
                            } else if (rangeStart <= currentStart && rangeEnd <= currentEnd) {
                                if (typeof currentRange === 'number') {
                                    // only occurs when [1,4] merge with 4 since [1,3]->4 and [1,2]-> are handled in previous if statements
                                    iterateRanges[i] = {
                                        start: rangeStart,
                                        end: rangeEnd
                                    }
                                } else {
                                    currentRange.start = rangeStart;
                                }
                                return;
                            } else if (rangeStart <= currentStart && rangeEnd > currentEnd) {
                                if (typeof currentRange === 'number') {
                                    iterateRanges[i] = {
                                        start: rangeStart,
                                        end: rangeEnd
                                    };
                                } else {
                                    currentRange.start = rangeStart;
                                    currentRange.end = rangeEnd;
                                }
                                break;
                            } else if (rangeStart > currentStart && rangeEnd <= currentEnd) {
                                return;
                            } else if (rangeStart > currentStart && rangeStart <= currentEnd && rangeEnd > currentEnd) {
                                // currentRange must not be a number
                                (currentRange as LinesRange).end = rangeEnd;
                                break;
                            } else if (rangeStart === currentEnd + 1) {
                                if (typeof currentRange === 'number') {
                                    iterateRanges[i] = {
                                        start: currentRange,
                                        end: rangeEnd
                                    };
                                } else {
                                    currentRange.end = rangeEnd;
                                }
                                break;
                            } else if (rangeStart > currentEnd + 1) {
                                if (i === iterateRanges.length - 1) {
                                    iterateRanges.push(range);
                                    return;
                                } else {
                                    continue;
                                }
                            } else {
                                throw Error("Unhandled scenario 3");
                            }
                        }
                    }
                    if (i < iterateRanges.length) {
                        let modifiedRange = iterateRanges[i] as LinesRange;
                        for (i = i + 1; i < iterateRanges.length; i++) {
                            let currentRange = iterateRanges[i];
                            let currentStart = getStart(currentRange);
                            let currentEnd = getEnd(currentRange);
                            if (modifiedRange.end < currentStart - 1) {
                                return;
                            } else if (modifiedRange.end >= currentStart - 1 && modifiedRange.end <= currentEnd) {
                                modifiedRange.end = currentEnd;
                                iterateRanges.splice(i, 1);
                                return;
                            } else {
                                iterateRanges.splice(i, 1);
                                i--
                            }
                        }
                        return;
                    }
                }
            }
            throw Error("Unhandled scenario 4");
        }
    }

    public hitLine(lineData: Uint8Array): void {
        if (this.lastViewEndsWithCR && lineData[lineData.length - 1] === 13) {
            lineData = lineData.slice(0, lineData.length - 1);
        }
        let progress = 0;
        let match = false;
        let iterateComplete = false;
        if (!this.fullIterate) {
            if (this.currentLineNumber === this.expectLineNumber) {
                match = true;
                //debugger;
                if (this.expectLineNumber === getEnd(this.currentIterateRange as LinesRange | number)) {
                    iterateComplete = true;
                } else {
                    this.expectLineNumber++;
                }
            }
            if (this.currentLineNumber === this.iterateProgress[0]) {
                respondMessage(createProgressResponseMessage(101 - this.iterateProgress.length));
                this.iterateProgress.splice(0, 1);
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
                    let overSize = lineData.length > this.indexSize;
                    this.linesIndex.push({
                        start: this.processedViewLength,
                        startLine: this.currentLineNumber,
                        end: isLast || overSize ? this.processedViewLength + lineData.length : 0,
                        endLine: isLast || overSize ? this.currentLineNumber : 0
                    });
                }
            }
        }
        if (this.isGetLine && match) {
            if (lineData.buffer.byteLength != lineData.byteLength) {
                lineData = new Uint8Array(lineData);
            }
            if (this.lastGetLineItem) {
                this.lastGetLineItem.contents.push(this.getLineNeedDecode ? utf8decoder.decode(lineData) : lineData);
                if (iterateComplete) {
                    this.getLineResult.push(this.lastGetLineItem);
                    this.lastGetLineItem = null;
                }
            }
        }
        if (match && iterateComplete) {
            this.iterateNext();
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

        if (!this.fullIterate) {
            // if (this.shouldReportProgress(progress)) {
            //     this.lastProgress = progress;
            //     respondMessage(createProgressResponseMessage(progress < 100 ? progress : 100));
            // }
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
    public file!: File;
    private fr!: FileReader;
    public linesIndex!: ILineIndexRange[];
    private lineBreakType: LineBreakType = LineBreakType.UNKNOWN;
    private iterator!: Iterator;
    private lineCount!: number;
    private sniffLines!: (string | Uint8Array)[];

    constructor(file: File, onNewLineConfig?: IIteratorConfigMessage, sniffConfig?: ISniffConfig) {
        if (Object.prototype.toString.call(file).toLowerCase() !== '[object file]') {
            respondMessage(new ResponseMessage(false, 'Invalid file object'));
            return;
        }
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
                        if (iterator.fullIterate) {
                            endsWithCR = true;
                            mergeAll = true;
                        } else {
                            view = new Uint8Array(0);
                        }
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
            if (!iterator.fullIterate) {
                iterator.seekRanges.splice(0, 1);
            } else {
                iterator.offset += DEFAULT_CHUNK_SIZE;
            }
            this.seek();
        };
        this.iterator = new Iterator(this);
        if (sniffConfig) {
            if (sniffConfig.lineNumber < 1) {
                respondMessage(new ResponseMessage(false, 'Sniff line number is invalid.'));
                return;
            }
            this.sniffLines = [];
            //this.iterator.linesToIterate = sniffConfig.lineNumber;
        } else {
            this.iterator.buildIndex = true;
            this.iterator.indexSize = Math.round(file.size / 1000);
            if (this.iterator.indexSize === 0) {
                this.iterator.indexSize = 1;
            }
        }
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

    private iterateLinesInternal(onNewLineFunc: ((this: Iterator, lineDate: Uint8Array) => void) | null, onSeekComplete?: (this: Iterator) => void) {
        this.iterator.onEachLineInternal = onNewLineFunc;
        if (onSeekComplete) {
            this.iterator.onSeekComplete = onSeekComplete;
        }
        this.seek();
    }

    private _iterateLines(config: IIteratorConfigMessage, start: number | null, count: number | null, onSeekComplete: () => void) {
        // let _this = this;
        // this.iterator.offset = 0;
        // this.iterator.endOffset = this.file.size;
        // this.iterator.bindEachLineFromConfig(config);
        // this.iterator.onSeekComplete = function () {
        //     this.eachLineScope = _this.removeFunctionsFromObject(this.eachLineScope);
        //     onSeekComplete();
        // }
        // if (start !== null && count !== null) {
        //     if (this.setPartialIterator(start, count)) {
        //         this.seek();
        //     } else {
        //         return;
        //     }
        // } else {
        //     this.seek();
        // }
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

    private seek() {
        let done: boolean;
        if (!this.iterator.fullIterate) {
            done = this.iterator.seekRanges.length === 0;
        } else {
            done = this.iterator.offset >= this.iterator.endOffset;
        }
        if (done) {
            respondMessage(createProgressResponseMessage(100));
            if (this.iterator.lineView.byteLength || this.iterator.expectLineNumber === this.iterator.currentLineNumber) {
                this.iterator.hitLine(this.iterator.lineView);
                this.iterator.lineView = new Uint8Array(0);
            }
            if (this.iterator.onSeekComplete) {
                this.iterator.onSeekComplete.call(this.iterator);
            }
            this.iterator = new Iterator(this);
        } else {
            if (this.iterator.fullIterate) {
                let slice: Blob = this.file.slice(this.iterator.offset, this.iterator.offset + DEFAULT_CHUNK_SIZE);
                this.fr.readAsArrayBuffer(slice);
            } else {
                if (this.iterator.lineView.byteLength || this.iterator.expectLineNumber === this.iterator.currentLineNumber) {
                    this.iterator.hitLine(this.iterator.lineView);
                    this.iterator.lineView = new Uint8Array(0);
                }
                this.fr.readAsArrayBuffer(this.iterator.seekNext(this.file));
            }
        }
    }

    public getLines(data: { linesRanges: LinesRanges, decode: boolean }): void {
        this.iterator = new Iterator(this, data.linesRanges);
        this.iterator.isGetLine = true;
        this.iterator.getLineNeedDecode = data.decode;
        this.iterateLinesInternal(null, () => {
            let result = this.iterator.getLineResult;
            setTimeout(() => {
                respondMessage(new ResponseMessage(result));
            });
        });
    }

    public _testRanges(linesRanges: LinesRanges): void {
        let iterator = new Iterator(this, linesRanges);
        try {
            respondMessage(new ResponseMessage(iterator.seekRanges));
        }
        catch (error) {
            respondMessage(new ResponseMessage(false, error));
        }
    }
}