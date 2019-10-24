export interface IRequestMessage {
    action: string;
    data: any;
    taskId: number;
}

export interface IResponseMessage {
    success: boolean;
    message: string;
    result: any;
    taskId: number;
    done: boolean;
}

export interface IIteratorConfigMessage {
    eachLine: string;
    scope: object;
    functionMap: string[];
}
export interface IGetSporadicLinesResult {
    lineNumber: number;
    value: string | Uint8Array;
}

export type LinesRange = {
    start: number;
    end: number;
}

export type LinesRanges = (LinesRange | number)[];