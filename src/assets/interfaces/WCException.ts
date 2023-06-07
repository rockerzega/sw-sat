import { CRequest } from '../clases/crequest';
import { CResponse } from '../clases/cresponse';

export class WCException extends Error {
    private _request: CRequest;

    private _response: CResponse;

    private readonly _previous?: Error;

    constructor(message: string, request: CRequest, response: CResponse, previous?: Error) {
        super(message);
        this._request = request;
        this._response = response;
        this._previous = previous;
    }

    public getRequest(): CRequest {
        return this._request;
    }

    public getResponse(): CResponse {
        return this._response;
    }

    public getPrevious(): Error | undefined {
        return this._previous;
    }
}