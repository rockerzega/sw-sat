import { CResponse } from '@/src/assets/clases/cresponse'
import { CRequest } from '../clases/crequest'
import { call } from '@/src/assets/libs/peticiones'
import { BadRequestError } from 'restify-errors'
import { createHash, randomUUID } from 'crypto'
import { Credential, SignatureAlgorithm } from '@nodecfdi/credentials'
import { createTokenFromSoapResponse, nospaces, parseXml, cleanPemContents } from '@/src/assets/libs/utils'
import dayjs from 'dayjs'
import { ServiceEndpoints } from '@/src/assets/clases/serviceEndpoints'
import { WCInterface } from '@/src/assets/interfaces/WCInterface'
import Debug from 'debug'

const debug = Debug('api:src:assets:libs:autorizacion')


function createXmlSecurityToken(): string {
  const md5 = createHash('md5').update(randomUUID()).digest('hex')

  return `uuid-${md5.substring(0, 8)}-${md5.substring(8, 4)}-${md5.substring(12, 4)}-${md5.substring(
      16,
      4
  )}-${md5.substring(20)}-1`;
}

function createKeyInfoData(fiel: Credential): string {
  const certificate = cleanPemContents(fiel.certificate().pem())
  const serial = fiel.certificate().serialNumber().decimal()
  const issuerName = parseXml(fiel.certificate().issuerAsRfc4514());

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
  `;
}

function createSignature(toDigest: string, signedInfoUri = '', keyInfo = '', fiel?: Credential): string {
  toDigest = nospaces(toDigest);
  const digested = createHash('sha1').update(toDigest).digest('base64');
  let signedInfo = createSignedInfoCanonicalExclusive(digested, signedInfoUri);
  const signatureValue = Buffer.from(fiel.sign(signedInfo, SignatureAlgorithm.SHA1), 'hex').toString(
      'base64'
  )
  signedInfo = signedInfo.replace('<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">', '<SignedInfo>');

  if (keyInfo === '') {
      keyInfo = createKeyInfoData(fiel)
  }

  return `
      <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
          ${signedInfo}
          <SignatureValue>${signatureValue}</SignatureValue>
          ${keyInfo}
      </Signature>
  `;
}

function createSignedInfoCanonicalExclusive(digested: string, uri = ''): string {
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

function authorization(created: string, expires: string, securityTokenId = '', fiel?: Credential): string {
  const uuid = securityTokenId || createXmlSecurityToken()
  const certificate = cleanPemContents(fiel.certificate().pem())
  const inicio = dayjs(created).toISOString()
  const fin = dayjs(expires).toISOString()
  const keyInfoData = `
      <KeyInfo>
          <o:SecurityTokenReference>
              <o:Reference URI="#${uuid}" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"/>
          </o:SecurityTokenReference>
      </KeyInfo>
  `;
  const toDigestXml = `
      <u:Timestamp xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" u:Id="_0">
          <u:Created>${inicio}</u:Created>
          <u:Expires>${fin}</u:Expires>
      </u:Timestamp>
  `;
  const signatureData = createSignature(toDigestXml, '#_0', keyInfoData, fiel)
  const xml = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
          <s:Header>
              <o:Security xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" s:mustUnderstand="1">
                  <u:Timestamp u:Id="_0">
                      <u:Created>${inicio}</u:Created>
                      <u:Expires>${fin}</u:Expires>
                  </u:Timestamp>
                  <o:BinarySecurityToken u:Id="${uuid}" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">
                      ${certificate}
                  </o:BinarySecurityToken>
                  ${signatureData}
              </o:Security>
          </s:Header>
          <s:Body>
              <Autentica xmlns="http://DescargaMasivaTerceros.gob.mx"/>
          </s:Body>
      </s:Envelope>
  `

  return nospaces(xml)
}

function createHeaders(soapAction: string, token?: string): Record<string, string> {
  const headers = new Map();
  headers.set('SOAPAction', soapAction);
  if (token) {
      headers.set('Authorization', `WRAP access_token="${token}"`);
  }

  return Object.fromEntries(headers);
}

async function RunRequest(webClient: WCInterface, request: CRequest): Promise<CResponse> {
  // webClient.fireRequest(request);
  let response: CResponse;
  try {
      response = await call(request);
  } catch (error) {
      throw new BadRequestError(error)
  }
  // webClient.fireResponse(response);

  return response;
}

export async function ejecutar(
  webClient: WCInterface,
  soapAction: string,
  uri: string,
  body: string,
  token?: string,
): Promise<string> {
  const headers = createHeaders(soapAction, token)
  const request = new CRequest('POST', uri, body, headers)
  let response: CResponse
  try {
      response = await RunRequest(webClient, request)
  } catch (error) {
    throw new BadRequestError(error)
  }
  return response.getBody()
}

export async function getAuthorizacion (fiel: Credential) {
  try {
    debug('Se esta construyendo la autorizacion')
    const inicio = dayjs().toString()
    const fin = dayjs().add(5, 'minutes').toString()
    const xml = authorization(inicio, fin, undefined, fiel)
    let wc: WCInterface
    const endpoints = ServiceEndpoints.cfdi()
    const responseBody = await ejecutar(
      wc,
      'http://DescargaMasivaTerceros.gob.mx/IAutenticacion/Autentica',
      endpoints.getAuthenticate(),
      xml,
    )

    return createTokenFromSoapResponse(responseBody)
  } catch(error) {
    throw new BadRequestError(error)
  }

}