import { createHash } from 'crypto'
import { Router } from 'restify-router'
import { WCInterface } from '../assets/interfaces/WCInterface'
import { Credential, SignatureAlgorithm } from '@nodecfdi/credentials'
import { ejecutar, getAuthorizacion } from '../assets/libs/authorizacion'
import { ServiceEndpoints } from '../assets/clases/serviceEndpoints'
import { nospaces, parseXml, cleanPemContents,readXmlElement, findAtrributes, findContents } from '../assets/libs/utils'

const router = new Router()
const endpoints = ServiceEndpoints.cfdi()
let fiel: Credential
const VALUESESTADO = [
  { code: 0, name: 'Unknown', message: 'Desconocido' },
  { code: 1, name: 'Accepted', message: 'Aceptada' },
  { code: 2, name: 'InProgress', message: 'En proceso' },
  { code: 3, name: 'Finished', message: 'Terminada' },
  { code: 4, name: 'Failure', message: 'Error' },
  { code: 5, name: 'Rejected', message: 'Rechazada' },
  { code: 6, name: 'Expired', message: 'Vencida' }
]

const VALUESRESPUESTA = [
  {
      code: 5000,
      name: 'Accepted',
      message: 'Solicitud recibida con éxito'
  },
  {
      code: 5002,
      name: 'Exhausted',
      message: 'Se agotó las solicitudes de por vida: Máximo para solicitudes con los mismos parámetros'
  },
  {
      code: 5003,
      name: 'MaximumLimitReaded',
      message: 'Tope máximo: Indica que se está superando el tope máximo de CFDI o Metadata'
  },
  {
      code: 5004,
      name: 'EmptyResult',
      message: 'No se encontró la información: Indica que no generó paquetes por falta de información.'
  },
  {
      code: 5005,
      name: 'Duplicated',
      message: 'Solicitud duplicada: Si existe una solicitud vigente con los mismos parámetros'
  }
]

function verifyBody(requestId: string): string {
  const xmlRequestId = parseXml(requestId)
  const xmlRfc = parseXml(fiel.rfc())

  const toDigestXml = `
      <des:VerificaSolicitudDescarga xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx">
          <des:solicitud IdSolicitud="${xmlRequestId}" RfcSolicitante="${xmlRfc}"></des:solicitud>
      </des:VerificaSolicitudDescarga>
  `;
  const signatureData = createSignature(toDigestXml);

  const xml = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">
          <s:Header/>
          <s:Body>
              <des:VerificaSolicitudDescarga>
                  <des:solicitud IdSolicitud="${xmlRequestId}" RfcSolicitante="${xmlRfc}">
                      ${signatureData}
                  </des:solicitud>
              </des:VerificaSolicitudDescarga>
          </s:Body>
      </s:Envelope>
  `

  return nospaces(xml)
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
  `

  return nospaces(xml)
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

function createVerifyResultFromSoapResponse(content: string) {
  const env = readXmlElement(content)

  const values = findAtrributes(
      env,
      ...['body', 'VerificaSolicitudDescargaResponse', 'VerificaSolicitudDescargaResult']
  );
  const status = {code: Number(values.codestatus) ?? 0, message: values.mensaje ?? '' }
  const statusRequest = VALUESESTADO.find( item => item.code === Number(values.estadosolicitud) ?? 0) 

  const codeRequest = VALUESRESPUESTA.find( item => item.code === Number(values.codigoestadosolicitud ?? 0))
  const numberCfdis = Number(values.numerocfdis) ?? 0
  const packages = findContents(
      env,
      ...['body', 'VerificaSolicitudDescargaResponse', 'VerificaSolicitudDescargaResult', 'IdsPaquetes']
  );

  return { status, statusRequest, codeRequest, numberCfdis, ...packages }
}

async function verify(requestId: string) {
  const soapBody = verifyBody(requestId)
  const currentToken = (await getAuthorizacion(fiel)).getValue()
  let wc: WCInterface
  const responseBody = await ejecutar(
      wc,
      'http://DescargaMasivaTerceros.sat.gob.mx/IVerificaSolicitudDescargaService/VerificaSolicitudDescarga',
      endpoints.getVerify(),
      soapBody,
      currentToken
  )

  return createVerifyResultFromSoapResponse(responseBody)
}

router.post('', async (req, res) => {  
  try {

    const certificatePath = req.files?.cert.path
    const keyPath = req.files?.keyPEM.path
    const { password, idsolicitud } = req.body
    
     fiel = Credential.openFiles(certificatePath, keyPath, password)
    
    const respuesta = await verify(idsolicitud)

    res.json(respuesta)
    } catch (error) {
      throw new Error(`HTTP Error: ${error.message}`);
    }
})

export default router