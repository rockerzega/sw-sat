import moment from 'moment'
import { createHash } from 'crypto'
import { Router } from 'restify-router'
import { BadRequestError } from 'restify-errors'
import { WCInterface } from '@/src/assets/interfaces/WCInterface'
import { ServiceEndpoints } from '../assets/clases/serviceEndpoints'
import { Credential, SignatureAlgorithm } from '@nodecfdi/credentials'
import { ejecutar, getAuthorizacion } from '../assets/libs/authorizacion'
import { nospaces, parseXml, cleanPemContents, readXmlElement, findAtrributes } from '../assets/libs/utils'

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
      let rfcReceivers: Array<string>
      if (queryParameters.type === 'issued') {
          rfcIssuer = rfcSigner;
          rfcReceivers = queryParameters.listaRFC;
      } else {
          rfcIssuer = queryParameters.listaRFC[0] ?? ''
          rfcReceivers = queryParameters.listaRFC
      }
      solicitudAttributes.set('FechaInicial', start);
      solicitudAttributes.set('FechaFinal', end);
      solicitudAttributes.set('RfcEmisor', rfcIssuer);
      solicitudAttributes.set('TipoComprobante', queryParameters.documentType)
      solicitudAttributes.set('EstadoComprobante', queryParameters.documentStatus)
      solicitudAttributes.set('RfcACuentaTerceros', queryParameters.rfcOnBehalf)
      solicitudAttributes.set('Complemento', queryParameters.complemento)
      if (rfcReceivers.length > 0) {
          xmlRfcReceived = rfcReceivers
              .map((rfcMatch) => {
                  return `<des:RfcReceptor>${parseXml(rfcMatch)}</des:RfcReceptor>`;
              })
              .join('');
          xmlRfcReceived = `<des:RfcReceptores>${xmlRfcReceived}</des:RfcReceptores>`;
      }
  }
  const cleanedSolicitudAttributes = new Map();
  for (const [key, value] of solicitudAttributes) {
      if (value !== '') cleanedSolicitudAttributes.set(key, value);
  }
  const sortedValues = new Map([...cleanedSolicitudAttributes].sort((a, b) => String(a[0]).localeCompare(b[0])))
  const solicitudAttributesAsText = [...sortedValues]
      .map(([name, value]) => {
          console.log(name, value)
          return `${parseXml(name)}="${parseXml(value)}"`;
      })
      .join(' ')
  const toDigestXml = `
      <des:SolicitaDescarga xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx">
          <des:solicitud ${solicitudAttributesAsText}>
              ${xmlRfcReceived}
          </des:solicitud>
      </des:SolicitaDescarga>
     `
  const signatureData = createSignature(toDigestXml);
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
  `
  return nospaces(xml)
}

function createQueryResultFromSoapResponse(content: string) {
  const env = readXmlElement(content)

  const values = findAtrributes(env, 'body', 'solicitaDescargaResponse', 'solicitaDescargaResult')
  const status = { code: Number(values.codestatus) ?? 0, message: values.mensaje ?? '' }
  const requestId = values.idsolicitud ?? ''

  return { status, requestId }
}

function createSignedInfoCanonicalExclusive(digested: string, uri = ''): string {
  // see https://www.w3.org/TR/xmlsec-algorithms/ to understand the algorithm
  // http://www.w3.org/2001/10/xml-exc-c14n# - Exclusive Canonicalization XML 1.0 (omit comments)
  const xml = `
      <SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
          <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>
          <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>
          <Reference URI="${uri}">
              <Transforms>
                  <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform>
              </Transforms>
              <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>
              <DigestValue>${digested}</DigestValue>
          </Reference>
      </SignedInfo>
  `;

  return nospaces(xml);
}

function createSignature(toDigest: string, signedInfoUri = '', keyInfo = ''): string {
  toDigest = nospaces(toDigest)
  const digested = createHash('sha1').update(toDigest).digest('base64')
  let signedInfo = createSignedInfoCanonicalExclusive(digested, signedInfoUri)
  const signatureValue = Buffer.from(fiel.sign(signedInfo, SignatureAlgorithm.SHA1), 'hex').toString(
      'base64'
  )
  signedInfo = signedInfo.replace('<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">', '<SignedInfo>')

  if (keyInfo === '') {
    keyInfo = createKeyInfoData()
  }

  return `
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      ${signedInfo}
      <SignatureValue>${signatureValue}</SignatureValue>
      ${keyInfo}
    </Signature>
  `
}

function createKeyInfoData(): string {
  const certificate = cleanPemContents(fiel.certificate().pem())
  const serial = fiel.certificate().serialNumber().decimal()
  const issuerName = parseXml(fiel.certificate().issuerAsRfc4514())

  return `
    <KeyInfo>
      <X509Data>
        <X509IssuerSerial>
          <X509IssuerName>${issuerName}</X509IssuerName>
          <X509SerialNumber>${serial}</X509SerialNumber>
        </X509IssuerSerial>
        <X509Certificate>${certificate}</X509Certificate>
      </X509Data>
    </KeyInfo>
  `
}

async function query(parametros) {
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
  const currentToken = (await getAuthorizacion(fiel)).getValue()
  const soapBody = queryBody(parametros)
  let wc: WCInterface
  const responseBody = await ejecutar(
      wc,
      'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescarga',
      endpoints.getQuery(),
      soapBody,
      currentToken,
  )

  return createQueryResultFromSoapResponse(responseBody);
}

router.post('', async (req, res) => {
  try {
    const certificatePath = req.files?.cert.path
    const keyPath = req.files?.keyPEM.path
    const { password, fechaInicio, fechaFin } = req.body
    fiel = Credential.openFiles(certificatePath, keyPath, password)
    const parametros: Record<string, any> = { fechaInicio, fechaFin }
    parametros.documentType = ''
    parametros.documentStatus = ''
    parametros.rfcOnBehalf = ''
    parametros.complemento =  ''
    parametros.uuid = ''
    parametros.listaRFC = ['EWE1709045U0']
    const xml = await query(parametros)
    res.send(xml)
  } catch(error) {
    console.log(error)
  }
})
export default router
