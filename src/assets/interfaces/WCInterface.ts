import { CRequest } from '../clases/crequest';
import { CResponse } from '../clases/cresponse';

export interface WCInterface {
    /**
     * Make the Http call to the web service
     * This method should *not* call fireRequest/fireResponse
     *
     * @throws WebClientException when an error is found
     */
    call(request: CRequest): Promise<CResponse>;

    /**
     * Method called before calling the web service
     */
    fireRequest(request: CRequest): void;

    /**
     * Method called after calling the web service
     */
    fireResponse(response: CResponse): void;
}
