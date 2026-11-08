$ErrorActionPreference = 'Stop'
$entryAppFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$entryAppPidFile = Join-Path $entryAppFolder '.runtime/server.pid'
if (Test-Path -LiteralPath $entryAppPidFile) {
  $entryAppPid = [int](Get-Content -LiteralPath $entryAppPidFile -Raw)
  $entryAppProcess = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $entryAppPid)
  if ($entryAppProcess -and $entryAppProcess.CommandLine.Contains((Join-Path $entryAppFolder 'server.mjs'))) { Stop-Process -Id $entryAppPid; Write-Output 'Приложение остановлено.' }
}
