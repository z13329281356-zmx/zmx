$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

while ($true) {
    & node.exe server.js
    Start-Sleep -Seconds 3
}
