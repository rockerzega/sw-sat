import { createHash } from 'crypto'
import { Router } from 'restify-router'
import { Credential, SignatureAlgorithm } from '@nodecfdi/credentials'
import { ejecutar, getAuthorizacion } from '../assets/libs/authorizacion'
import { nospaces, cleanPemContents, parseXml, readXmlElement, findAtrributes, findContent } from '../assets/libs/utils'
import { ServiceEndpoints } from '../assets/clases/serviceEndpoints'
import { WCInterface } from '../assets/interfaces/WCInterface'

const router = new Router()
const endpoints = ServiceEndpoints.cfdi()
let fiel: Credential

function downloadBody(packageId: string): string {
  const xmlPackageId = parseXml(packageId);
  const xmlRfcOwner = parseXml(fiel.rfc());

  const toDigestXml = `
      <des:PeticionDescargaMasivaTercerosEntrada xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx">
          <des:peticionDescarga IdPaquete="${xmlPackageId}" RfcSolicitante="${xmlRfcOwner}"></des:peticionDescarga>
      </des:PeticionDescargaMasivaTercerosEntrada>
  `;
  const signatureData = createSignature(toDigestXml);

  const xml = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">
          <s:Header/>
          <s:Body>
              <des:PeticionDescargaMasivaTercerosEntrada>
                  <des:peticionDescarga IdPaquete="${xmlPackageId}" RfcSolicitante="${xmlRfcOwner}">
                      ${signatureData}
                  </des:peticionDescarga>
              </des:PeticionDescargaMasivaTercerosEntrada>
          </s:Body>
      </s:Envelope>
  `;

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

function createDownloadResultFromSoapResponse(content: string) {
  const env = readXmlElement(content);
  const values = findAtrributes(env, 'header', 'respuesta');

  const status = { code: Number(values.codestatus) ?? 0, message: values.mensaje ?? '' }
  const cpackage = findContent(env, 'body', 'RespuestaDescargaMasivaTercerosSalida', 'Paquete');

  return { status, buffer: Buffer.from(cpackage).toString() || '' }
}

async function descargar(packageId: string) {
  const soapBody = downloadBody(packageId)
  const currentToken = (await getAuthorizacion(fiel)).getValue()
  let wc: WCInterface
  const responseBody = await ejecutar(
      wc,
      'http://DescargaMasivaTerceros.sat.gob.mx/IDescargaMasivaTercerosService/Descargar',
      endpoints.getDownload(),
      soapBody,
      currentToken
  )

  return createDownloadResultFromSoapResponse(responseBody);
}

router.post('', async (req, res) => {  
  try {

    const certificatePath = req.files?.cert.path
    const keyPath = req.files?.keyPEM.path
    const { password, idpaquete } = req.body
    
     fiel = Credential.openFiles(certificatePath, keyPath, password)
    
    const respuesta = await descargar(idpaquete)

    res.json(respuesta)
    } catch (error) {
      throw new Error(`HTTP Error: ${error.message}`)
    }
})

export default router