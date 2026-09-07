$ErrorActionPreference = 'Stop'

$taskName = 'AIGC-Annotation-Manager-8088'
$runner = Join-Path $PSScriptRoot 'keep-server.ps1'
$powershell = (Get-Command powershell.exe).Source
$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '"'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts the AIGC annotation LAN service after Windows logon.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Autostart installed and running: $taskName"
