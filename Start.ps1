param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$entryAppFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$entryAppUrl = 'http://127.0.0.1:4666'
$entryAppReady = $false
try {
  $entryAppHealth = Invoke-RestMethod -Uri ($entryAppUrl + '/health') -TimeoutSec 2
  if ($entryAppHealth.app -ne 'entry-navigator') { throw 'Порт 4666 занят другим приложением.' }
  $entryAppReady = $true
} catch {
  if ($_.Exception.Message -like '*другим приложением*') { throw }
}
if (-not $entryAppReady) {
  $entryAppNode = (Get-Command node.exe -ErrorAction Stop).Source
  $entryAppRuntime = Join-Path $entryAppFolder '.runtime'
  New-Item -ItemType Directory -Path $entryAppRuntime -Force | Out-Null
  $entryAppServer = Join-Path $entryAppFolder 'server.mjs'
  $entryAppProcess = Start-Process -FilePath $entryAppNode -ArgumentList @(('"' + $entryAppServer + '"'),'--port=4666') -WorkingDirectory $entryAppFolder -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $entryAppRuntime 'server.log') -RedirectStandardError (Join-Path $entryAppRuntime 'server-error.log')
  Set-Content -LiteralPath (Join-Path $entryAppRuntime 'server.pid') -Value $entryAppProcess.Id
  for ($entryAppAttempt = 0; $entryAppAttempt -lt 30; $entryAppAttempt++) {
    Start-Sleep -Milliseconds 150
    try { $entryAppHealth = Invoke-RestMethod -Uri ($entryAppUrl + '/health') -TimeoutSec 1; if ($entryAppHealth.app -eq 'entry-navigator') { $entryAppReady = $true; break } } catch {}
  }
  if (-not $entryAppReady) { throw 'Не удалось запустить приложение. Проверь .runtime/server-error.log.' }
}
Write-Output $entryAppUrl
if (-not $NoBrowser) { Start-Process $entryAppUrl }
