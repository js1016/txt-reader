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

interface ILinesRange {
    start: number;
    count?: number;
    end?: number;
}

export type LinesRange = RequireOnlyOne<ILinesRange, 'count' | 'end'>;
export type SporadicLineItem = number | LinesRange;
export type SporadicLinesMap = (SporadicLineItem)[];

type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
    Pick<T, Exclude<keyof T, Keys>>
    & {
        [K in Keys]-?:
        Required<Pick<T, K>>
        & Partial<Record<Exclude<Keys, K>, undefined>>
    }[Keys]