import { TextDecoder_Instance } from 'text-encoding-shim';

declare namespace TxtReaderLib {
    interface ITaskResponse {
        timeTaken: number;
        message: string;
        result: any;
    }

    type LoadFileResult = {
        lineCount: number;
        scope?: any;
    }

    interface IGetSporadicLinesResult {
        lineNumber: number;
        value: string | Uint8Array;
    }

    interface ILoadFileTaskResponse extends ITaskResponse {
        result: LoadFileResult;
    }

    interface IGetLinesTaskResponse extends ITaskResponse {
        result: (string | Uint8Array)[];
    }

    interface ISniffLinesTaskResponse extends ITaskResponse {
        result: (string | Uint8Array)[];
    }

    interface ISetChunkSizeResponse extends ITaskResponse {
        result: number;
    }

    interface IIterateLinesTaskResponse extends ITaskResponse {
        result: any;
    }

    interface IGetSporadicLinesTaskResponse extends ITaskResponse {
        result: IGetSporadicLinesResult[]
    }

    interface IIteratorEachLineThis {
        decode(value: Uint8Array): string;
        [key: string]: any;
    }

    interface IIteratorScope {
        [key: string]: any;
    }

    interface IIteratorConfig {
        eachLine: (this: IIteratorEachLineThis, raw: Uint8Array, progress: number, lineNumber: number) => void;
        scope?: IIteratorScope;
    }

    interface ILinesRange {
        start: number;
        count?: number;
        end?: number;
    }

    type LinesRange = RequireOnlyOne<ILinesRange, 'count' | 'end'>;
    type SporadicLineItem = number | LinesRange;
    type SporadicLinesMap = (SporadicLineItem)[];

    type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
        Pick<T, Exclude<keyof T, Keys>>
        & {
            [K in Keys]-?:
            Required<Pick<T, K>>
            & Partial<Record<Exclude<Keys, K>, undefined>>
        }[Keys]

    interface TxtReaderTask<T> {
        then(onComplete: (response: T) => void): TxtReaderTask<T>;
        progress(onProgress: (progress: number) => void): TxtReaderTask<T>;
        catch(onFail: (reason: string) => void): TxtReaderTask<T>;
    }

    interface TxtReader_Static {
        new(): TxtReader;
    }

    interface TxtReader {
        lineCount: number;
        utf8decoder: TextDecoder_Instance;
        loadFile(file: File, config?: IIteratorConfig): TxtReaderTask<ILoadFileTaskResponse>;
        getLines(start: number, count: number, decode?: boolean): TxtReaderTask<IGetLinesTaskResponse>;
        iterateLines(config: IIteratorConfig, start?: number, count?: number): TxtReaderTask<IIterateLinesTaskResponse>;
        sniffLines(file: File, lineNumber: number, decode?: boolean): TxtReaderTask<ISniffLinesTaskResponse>;
        getSporadicLines(sporadicLinesMap: SporadicLinesMap, decode?: boolean): TxtReaderTask<IGetSporadicLinesTaskResponse>;
        iterateSporadicLines(config: IIteratorConfig, sporadicLinesMap: SporadicLinesMap): TxtReaderTask<IIterateLinesTaskResponse>;
    }

    var TxtReader: TxtReader_Static
}

export = TxtReaderLib;