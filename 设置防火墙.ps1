$ErrorActionPreference = 'Stop'
$ruleName = 'AIGC-Annotation-Manager-8088'
$logFile = Join-Path $PSScriptRoot 'firewall-setup.log'
Start-Transcript -Path $logFile -Force | Out-Null

try {
    & netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
    & netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=8088 remoteip=localsubnet profile=any | Out-Host

    if ($LASTEXITCODE -ne 0) {
        throw '创建防火墙规则失败。'
    }

    Write-Host '防火墙规则已创建，仅允许本地子网访问 TCP 8088。'
} finally {
    Stop-Transcript | Out-Null
}
