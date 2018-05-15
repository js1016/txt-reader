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
}