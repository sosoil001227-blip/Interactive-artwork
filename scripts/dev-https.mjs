import { execFileSync } from 'node:child_process'
import { X509Certificate, createPrivateKey } from 'node:crypto'
import { accessSync, chmodSync, constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
export const certificateDirectory = join(projectRoot, '.certs')
export const certificatePath = join(certificateDirectory, 'dev-cert.pem')
export const privateKeyPath = join(certificateDirectory, 'dev-key.pem')

export function lanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flatMap(addresses => (addresses || [])
    .filter(address => !address.internal && (address.family === 'IPv4' ||
      (address.family === 'IPv6' && /^(?:[23]|f[cd])/i.test(address.address))))
    .map(address => address.address)))]
}

function mkcertPath() {
  for (const executable of ['mkcert', join(homedir(), '.local/bin/mkcert'), '/opt/homebrew/bin/mkcert', '/usr/local/bin/mkcert']) {
    try { execFileSync(executable, ['-version'], { stdio: 'ignore' }); return executable } catch { /* Try the next installation. */ }
  }
  throw new Error('mkcert를 설치한 뒤 npm run https:cert를 실행해 주세요. https://github.com/FiloSottile/mkcert')
}

export function generateCertificate() {
  const executable = mkcertPath()
  mkdirSync(certificateDirectory, { recursive: true, mode: 0o700 })
  chmodSync(certificateDirectory, 0o700)
  const addresses = lanAddresses()
  execFileSync(executable, ['-cert-file', certificatePath, '-key-file', privateKeyPath,
    'localhost', '127.0.0.1', '::1', ...addresses], { stdio: 'inherit' })
  chmodSync(privateKeyPath, 0o600)
  const caRoot = execFileSync(executable, ['-CAROOT'], { encoding: 'utf8' }).trim()
  // Only the public CA certificate is exported for other PCs. Never copy its key.
  copyFileSync(join(caRoot, 'rootCA.pem'), join(certificateDirectory, 'rootCA.pem'))
  const publicCA = new X509Certificate(readFileSync(join(caRoot, 'rootCA.pem')))
  writeFileSync(join(certificateDirectory, 'rootCA.cer'), publicCA.raw)
  console.log('개발 인증서 준비 완료. 개발 서버는 실행하지 않았습니다.')
  for (const address of addresses) {
    const host = address.includes(':') ? `[${address}]` : address
    console.log(`공유할 서버 주소 (예제 8~13): https://${host}:5174/`)
  }
  console.log('다른 기기에는 .certs/rootCA.pem 또는 rootCA.cer 공개 인증서만 전달하세요.')
  console.log('인증서 신뢰 등록: npm run https:trust (관리자 암호가 필요할 수 있습니다).')
}

export function readDevHttps() {
  try { accessSync(certificatePath, constants.R_OK); accessSync(privateKeyPath, constants.R_OK) }
  catch { throw new Error('HTTPS 개발 인증서가 없습니다. 먼저 npm run https:cert를 실행해 주세요.') }
  const cert = readFileSync(certificatePath), key = readFileSync(privateKeyPath)
  const certificate = new X509Certificate(cert)
  if (!certificate.checkPrivateKey(createPrivateKey(key))) throw new Error('인증서와 비밀키가 일치하지 않습니다. npm run https:cert를 실행해 주세요.')
  if (Date.parse(certificate.validTo) <= Date.now() || Date.parse(certificate.validFrom) > Date.now()) {
    throw new Error('개발 인증서가 만료되었거나 유효하지 않습니다. npm run https:cert를 실행해 주세요.')
  }
  const missing = ['127.0.0.1', '::1', ...lanAddresses()].filter(address => !certificate.checkIP(address))
  if (!certificate.checkHost('localhost') || missing.length) {
    throw new Error(`현재 주소가 인증서에 없습니다: ${missing.join(', ') || 'localhost'}. npm run https:cert를 실행한 뒤 다시 시작해 주세요.`)
  }
  return { cert, key }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--trust')) {
    try {
      execFileSync(mkcertPath(), ['-install'], { stdio: 'inherit' })
      console.log('이 Mac의 인증서 신뢰 등록 완료. 다른 기기는 각각 신뢰 등록이 필요합니다.')
    } catch {
      console.error('인증서 신뢰 등록에 실패했습니다. 관리자 암호와 위 오류를 확인한 뒤 npm run https:trust를 다시 실행하세요. 암호 입력은 화면에 표시되지 않습니다.')
      process.exitCode = 1
    }
  }
  else generateCertificate()
}
