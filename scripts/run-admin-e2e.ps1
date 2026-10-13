$ErrorActionPreference = 'Stop'
$testDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('codeproof-admin-e2e-' + [guid]::NewGuid().ToString('N'))
$testDirectory = [System.IO.Path]::GetFullPath($testDirectory)
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $testDirectory.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Test database path is outside the temporary directory.'
}
New-Item -ItemType Directory -Path $testDirectory | Out-Null
try {
  $env:CODEPROOF_ADMIN_E2E = '1'
  $env:CODEPROOF_ADMIN_E2E_EMAIL = 'owner-' + [guid]::NewGuid().ToString('N') + '@example.invalid'
  $env:CODEPROOF_ADMIN_E2E_PASSWORD = [guid]::NewGuid().ToString('N')
  $env:CODEPROOF_ADMIN_E2E_DB_PATH = Join-Path $testDirectory 'codeproof.db'
  $env:CODEPROOF_DB_PATH = $env:CODEPROOF_ADMIN_E2E_DB_PATH
  $env:ADMIN_EMAIL = $env:CODEPROOF_ADMIN_E2E_EMAIL
  node scripts/prepare-admin-e2e.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npx playwright test tests/e2e/admin-operations.spec.ts --project=desktop-en --project=mobile-ar --workers=1
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  $resolved = [System.IO.Path]::GetFullPath($testDirectory)
  if ($resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
      [System.IO.Path]::GetFileName($resolved).StartsWith('codeproof-admin-e2e-', [System.StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
