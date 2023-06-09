import { CRequest } from '../clases/crequest'
import { CResponse } from '../clases/cresponse'
import { ClientRequest } from 'node:http'
import https from 'node:https'
import { BadRequestError } from 'restify-errors'

export async function call(request: CRequest): Promise<CResponse> {
  const options = {
      method: request.getMethod(),
      headers: request.getHeaders()
  };

  return new Promise((resolve, reject) => {
      let req: ClientRequest;
      try {
          req = https.request(request.getUri(), options, (res) => {
              const code = res?.statusCode ?? 0;
              const body: Uint8Array[] = [];
              res.on('data', (chunk) => body.push(chunk));
              res.on('end', () => {
                  const resString = Buffer.concat(body).toString();
                  resolve(new CResponse(code, resString));
              })
          })
      } catch (error) {
          const err = error as Error;
          throw new BadRequestError(err.message, request)
      }

      req.on('error', (err) => {
          reject(new BadRequestError(err.message, request))
      })

      req.on('timeout', () => {
          req.destroy()
          reject(new BadRequestError('Tiempo de espera agotado'));
      })

      req.write(request.getBody());
      req.end();
  })
}