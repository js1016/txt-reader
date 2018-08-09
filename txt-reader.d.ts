import { TextDecoder_Instance } from 'text-encoding-shim';

declare namespace TxtReaderLib {
    interface ITaskResponse {
        timeTaken: number;
        message: string;
        result: any;
    }

    type LoadFileResult = {
        lineCount: number,
        scope?: any
    }

    interface ILoadFileTaskResponse extends ITaskResponse {
        result: LoadFileResult;
    }

    interface IGetLinesTaskResponse extends ITaskResponse {
        result: string[];
    }

    interface ISetChunkSizeResponse extends ITaskResponse {
        result: number;
    }

    interface IIterateLinesTaskResponse extends ITaskResponse {
        result: any;
    }

    interface IIteratorConfig {
        eachLine: (raw: Uint8Array, progress: number, lineNumber: number) => void;
        scope?: object;
    }

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
        getLines(start: number, count: number): TxtReaderTask<IGetLinesTaskResponse>;
        iterateLines(config: IIteratorConfig, start?: number, count?: number): TxtReaderTask<IIterateLinesTaskResponse>;
    }

    var TxtReader: TxtReader_Static
}

export = TxtReaderLib;