import { Router } from 'restify-router'
import { ServiceEndpoints } from '../assets/clases/serviceEndpoints'
import { BadRequestError } from 'restify-errors'
import { Credential  } from '@nodecfdi/credentials'
import moment from 'moment'
import { nospaces } from '../assets/utils'

const router = new Router()
const endpoints = ServiceEndpoints.cfdi()
let fiel:Credential

function queryBody (queryParameters): string {
  const queryUuid = queryParameters.uuid !== '';
  let xmlRfcReceived = '';
  const requestType = 'CFDI'
  const rfcSigner = fiel.rfc().toUpperCase()

  const solicitudAttributes = new Map<string, string>();
  solicitudAttributes.set('RfcSolicitante', rfcSigner);
  solicitudAttributes.set('TipoSolicitud', requestType);

  if (queryUuid) {
      solicitudAttributes.set('Folio', queryParameters.uuid);
  } else {
      const start = moment(queryParameters.fechaInicio).startOf('day').format("yyyy-MM-dd'T'HH:mm:ss")
      const end = moment(queryParameters.fechaFin).endOf('day').format("yyyy-MM-dd'T'HH:mm:ss")
      let rfcIssuer: string
      let rfcReceivers: any
      if (queryParameters.getDownloadType().isTypeOf('issued')) {
          // issued documents
          rfcIssuer = rfcSigner;
          rfcReceivers = queryParameters.getRfcMatches();
      } else {
          // received documents, counterpart is issuer
          rfcIssuer = queryParameters.getRfcMatches().getFirst().getValue();
          rfcReceivers = RfcMatches.createFromValues(rfcSigner);
      }
      solicitudAttributes.set('FechaInicial', start);
      solicitudAttributes.set('FechaFinal', end);
      solicitudAttributes.set('RfcEmisor', rfcIssuer);
      solicitudAttributes.set('TipoComprobante', queryParameters.getDocumentType().value());
      solicitudAttributes.set('EstadoComprobante', queryParameters.getDocumentStatus().value());
      solicitudAttributes.set('RfcACuentaTerceros', queryParameters.getRfcOnBehalf().getValue());
      solicitudAttributes.set('Complemento', queryParameters.getComplement().value());
      if (!rfcReceivers.isEmpty()) {
          xmlRfcReceived = rfcReceivers
              .itemsToArray()
              .map((rfcMatch) => {
                  return `<des:RfcReceptor>${this.parseXml(rfcMatch.getValue())}</des:RfcReceptor>`;
              })
              .join('');
          xmlRfcReceived = `<des:RfcReceptores>${xmlRfcReceived}</des:RfcReceptores>`;
      }
  }
  const cleanedSolicitudAttributes = new Map();
  for (const [key, value] of solicitudAttributes) {
      if (value !== '') cleanedSolicitudAttributes.set(key, value);
  }
  const sortedValues = new Map([...cleanedSolicitudAttributes].sort((a, b) => String(a[0]).localeCompare(b[0])));

  const solicitudAttributesAsText = [...sortedValues]
      .map(([name, value]) => {
          return `${this.parseXml(name)}="${this.parseXml(value)}"`;
      })
      .join(' ');

  const toDigestXml = `
      <des:SolicitaDescarga xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx">
          <des:solicitud ${solicitudAttributesAsText}>
              ${xmlRfcReceived}
          </des:solicitud>
      </des:SolicitaDescarga>
     `;
  const signatureData = this.createSignature(toDigestXml);
  const xml = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">
          <s:Header/>
          <s:Body>
              <des:SolicitaDescarga>
                  <des:solicitud ${solicitudAttributesAsText}>
                      ${xmlRfcReceived}
                      ${signatureData}
                  </des:solicitud>
              </des:SolicitaDescarga>
          </s:Body>
      </s:Envelope>
  `;

  return nospaces(xml);
}

function createQueryResultFromSoapResponse(content: string): QueryResult {
  const env = this.readXmlElement(content);

  const values = this.findAtrributes(env, 'body', 'solicitaDescargaResponse', 'solicitaDescargaResult');
  const status = new StatusCode(Number(values['codestatus']) ?? 0, values['mensaje'] ?? '');
  const requestId = values['idsolicitud'] ?? '';

  return new QueryResult(status, requestId);
}


export async function query(parametros) {
  if (!parametros.serviceType) {
      parametros.serviceType = endpoints.getServiceType()
  }
  if (endpoints.getServiceType() !== parametros.serviceType) {
      throw new BadRequestError(
        {
          info: { typeCode: 'WrongEndpoint' },
        },
        'El endpoit no es correcto para este peticion',
      )
  }
  
  const soapBody = queryBody(parametros);

  const currentToken = parametros.token;
  const responseBody = await this.consume(
      'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescarga',
      endpoints.getQuery(),
      soapBody,
      currentToken
  )

  return createQueryResultFromSoapResponse(responseBody);
}


router.get('', async (req, res) => {
  const certificatePath = req.files?.cert.path
  const keyPath = req.files?.keyPEM.path
  const { password, token } = req.body
  fiel = Credential.openFiles(certificatePath, keyPath, password)
  const parametros: Record<string, any> = {token}
  const xml = await query(parametros)
  res.send(xml)
})
export default router
