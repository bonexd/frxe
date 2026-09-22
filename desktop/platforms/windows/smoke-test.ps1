param(
  [Parameter(Mandatory = $true)]
  [string]$MsiPath,

  [Parameter(Mandatory = $false)]
  [string]$SetupPath
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $MsiPath).Path
if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
  throw "MSI not found: $MsiPath"
}

$target = Join-Path $env:RUNNER_TEMP ("vitr-msi-smoke-" + [guid]::NewGuid().ToString('N'))
if (-not $env:RUNNER_TEMP) {
  $target = Join-Path ([System.IO.Path]::GetTempPath()) ("vitr-msi-smoke-" + [guid]::NewGuid().ToString('N'))
}
New-Item -ItemType Directory -Path $target -Force | Out-Null

try {
  $args = @('/a', ('"' + $resolved + '"'), '/qn', ('TARGETDIR="' + $target + '"'))
  $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $args -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "MSI administrative extraction failed with exit code $($process.ExitCode)"
  }

  $files = @(Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction Stop)
  if ($files.Count -eq 0) {
    throw 'MSI smoke test extracted no files.'
  }

  Write-Host "MSI smoke test passed: $resolved"

  if ($SetupPath) {
    $setupResolved = (Resolve-Path -LiteralPath $SetupPath).Path
    $setupInfo = Get-Item -LiteralPath $setupResolved
    if ($setupInfo.Length -lt 1MB) {
      throw "Vitr setup EXE is unexpectedly small: $($setupInfo.Length) bytes"
    }
    $stream = [System.IO.File]::OpenRead($setupResolved)
    try {
      $first = $stream.ReadByte()
      $second = $stream.ReadByte()
      if ($first -ne 0x4D -or $second -ne 0x5A) {
        throw "Vitr setup EXE is not a valid Windows executable."
      }
    }
    finally {
      $stream.Dispose()
    }
    Write-Host "Vitr setup EXE smoke test passed: $setupResolved"
  }
}
finally {
  Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
}
