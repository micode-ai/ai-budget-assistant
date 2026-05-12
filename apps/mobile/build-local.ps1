Write-Host "=== Building Android .aab locally via WSL ===" -ForegroundColor Cyan
Write-Host "This will take 10-20 minutes..."

wsl bash -c @"
cd /mnt/d/Work/micode/ai-budget-assistant

# Install dependencies if needed
if ! command -v eas &> /dev/null; then
  echo '=== Installing EAS CLI ==='
  npm install -g eas-cli@latest
fi

# Check Java
if ! command -v java &> /dev/null; then
  echo '=== Installing Java ==='
  sudo apt-get update -qq && sudo apt-get install -y -qq default-jdk
fi

echo '=== Installing npm dependencies ==='
npm ci

echo '=== Starting EAS build ==='
cd apps/mobile
eas build --platform android --profile production --local --non-interactive

echo '=== Build complete! ==='
ls -la *.aab 2>/dev/null || ls -la build-*.tar.gz 2>/dev/null || echo 'Check apps/mobile/ for output file'
"@

Write-Host "`n=== Done! Check apps/mobile/ for .aab file ===" -ForegroundColor Green
