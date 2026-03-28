# Build script for iScope360 Super Agent

# 1. Build the binary
Write-Host "Building Super Agent..." -ForegroundColor Cyan
& "C:\Program Files\Go\bin\go.exe" build -o iscope-agent.exe ./cmd/agent/main.go

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build successful: iscope-agent.exe" -ForegroundColor Green

# 2. Instructions
Write-Host "`nTo start the agent, ensure the platform API is running on localhost:8000 and run:" -ForegroundColor Yellow
Write-Host "./iscope-agent.exe" -ForegroundColor White
