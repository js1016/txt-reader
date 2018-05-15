declare namespace TxtReaderLib {
    interface ITaskResponse {
        timeTaken: number;
        message: string;
        result: any;
    }

    interface IIteratorConfig {
        eachLine: (raw: Uint8Array, progress: number, lineNumber: number) => void;
        scope?: object;
    }

    interface TxtReaderTask {
        then(onComplete: (response: ITaskResponse) => void): TxtReaderTask;
        progress(onProgress: (progress: number) => void): TxtReaderTask;
        catch(onFail: (reason: string) => void): TxtReaderTask;
    }

    interface TxtReader_Static {
        new(): TxtReader_Instance;
    }

    interface TxtReader_Instance {
        lineCount: number;
        loadFile(file: File, config: IIteratorConfig): TxtReaderTask;
        getLines(start: number, count: number): TxtReaderTask;
        iterateLines(config: IIteratorConfig, start?: number, count?: number): TxtReaderTask;
    }

    var TxtReader: TxtReader_Static
}

export = TxtReaderLib;