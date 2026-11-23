$ErrorActionPreference = 'Stop'
$readerRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$jobDirectory = Join-Path $readerRoot '.work\cover-jobs'
$null = New-Item -ItemType Directory -Force -Path $jobDirectory
$heartbeat = Join-Path $jobDirectory 'heartbeat'
if ((Test-Path -LiteralPath $heartbeat) -and ((Get-Date) - (Get-Item -LiteralPath $heartbeat).LastWriteTime).TotalSeconds -lt 15) {
    return
}
$binary = Get-Command codex.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $binary) {
    $extensionRoot = Join-Path $env:USERPROFILE '.vscode\extensions'
    $binary = Get-ChildItem -Path "$extensionRoot\openai.chatgpt-*\bin\*\codex.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $binary) { throw 'Install the Codex CLI and sign in with ChatGPT before starting the cover worker.' }
$env:DUDIAN_CODEX_BIN = $binary
$node = (Get-Command node.exe).Source
Start-Process -FilePath $node -ArgumentList 'scripts/cover-worker.mjs' -WorkingDirectory $readerRoot -WindowStyle Hidden -RedirectStandardError (Join-Path $jobDirectory 'worker.log')
