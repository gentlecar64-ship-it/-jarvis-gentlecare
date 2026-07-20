$ErrorActionPreference = 'Stop'

Write-Host 'MAVIK - nettoyage des fichiers generes suivis par Git' -ForegroundColor Cyan

$paths = @(
  'server/backups',
  'server/data/diagnostics-last.json',
  'server/data/mavik-crash.log',
  'server/data/sessions.json',
  'server/data/emergency-alert.json',
  'server/data/internal-messages.json',
  'server/data/jarvis-intelligence.json',
  'server/data/jarvis-morale-state.json',
  'server/data/reputation.json',
  'server/data/gcos-local.json',
  'server/data/updates/state.json',
  'server/data/users.json'
)

foreach ($path in $paths) {
  git rm --cached -r --ignore-unmatch -- $path | Out-Host
}

Write-Host ''
Write-Host 'Les fichiers restent sur le PC mais ne seront plus suivis par Git.' -ForegroundColor Green
Write-Host 'Les fichiers de code, HTML, CSS, JavaScript et package-lock ne sont pas touches.' -ForegroundColor Green
Write-Host ''
git status --short
