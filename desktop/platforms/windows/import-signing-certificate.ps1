$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE)) {
  throw 'WINDOWS_CERTIFICATE is required.'
}
if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PASSWORD)) {
  throw 'WINDOWS_CERTIFICATE_PASSWORD is required.'
}

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$nonce = [guid]::NewGuid().ToString('N')
$encodedPath = Join-Path $tempRoot "vitr-windows-certificate-$nonce.b64"
$pfxPath = Join-Path $tempRoot "vitr-windows-certificate-$nonce.pfx"

try {
  Set-Content -LiteralPath $encodedPath -Value $env:WINDOWS_CERTIFICATE -NoNewline
  & certutil.exe -f -decode $encodedPath $pfxPath | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pfxPath -PathType Leaf)) {
    throw 'Could not decode WINDOWS_CERTIFICATE.'
  }

  $password = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
  $certificate = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation 'Cert:\CurrentUser\My' -Password $password |
    Where-Object { $_.HasPrivateKey } |
    Select-Object -First 1

  if (-not $certificate -or [string]::IsNullOrWhiteSpace($certificate.Thumbprint)) {
    throw 'Imported Windows certificate does not contain a usable private key.'
  }

  Write-Output $certificate.Thumbprint
}
finally {
  Remove-Item -LiteralPath $encodedPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
}
