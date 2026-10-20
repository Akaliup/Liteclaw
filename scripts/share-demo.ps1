#requires -Version 5.1
<#
.SYNOPSIS
  一键把 LiteClaw 演示空间跑起来并（可选）开一个公网地址，供面试现场使用。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\share-demo.ps1
  powershell -ExecutionPolicy Bypass -File scripts\share-demo.ps1 -Port 5400 -NoTunnel
#>
param(
  [int]$Port = 5400,
  [switch]$NoTunnel
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  if (-not (Test-Path 'web\node_modules')) {
    Write-Host '未找到 web/node_modules，先执行 npm --prefix web ci …' -ForegroundColor Yellow
    npm --prefix web ci
  }

  Write-Host "启动 Vite（端口 $Port）…" -ForegroundColor Cyan
  $vite = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('--prefix', 'web', 'run', 'dev', '--', '--port', "$Port", '--host', '127.0.0.1') `
    -PassThru -NoNewWindow

  $ready = $false
  for ($i = 0; $i -lt 120; $i++) {
    if (Test-NetConnection -ComputerName '127.0.0.1' -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    throw "Vite 未能在端口 $Port 上就绪。换端口重试：-Port 13000，例如 5400/13000 在这台机器上可用。"
  }

  Write-Host ''
  Write-Host "本地地址: http://127.0.0.1:$Port/demo" -ForegroundColor Green
  Write-Host "真实工作台: http://127.0.0.1:$Port/chat（需要后端 npm start）" -ForegroundColor DarkGray
  Write-Host ''

  if ($NoTunnel) {
    Write-Host "已跳过隧道。演示结束后可关闭本窗口，或执行：Stop-Process -Id $($vite.Id)" -ForegroundColor DarkGray
    return
  }

  if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Write-Host '正在建立 Cloudflare 临时隧道（TryCloudflare），把下面的 https 地址发给面试官…' -ForegroundColor Cyan
    cloudflared tunnel --url "http://127.0.0.1:$Port"
  }
  elseif (Get-Command ngrok -ErrorAction SilentlyContinue) {
    Write-Host '正在建立 ngrok 隧道…' -ForegroundColor Cyan
    ngrok http $Port
  }
  else {
    Write-Host '未检测到 cloudflared / ngrok。任选一种装好后再跑一次：' -ForegroundColor Yellow
    Write-Host '  winget install --id Cloudflare.cloudflared -e'
    Write-Host '  winget install --id Ngrok.Ngrok -e'
    Write-Host ''
    Write-Host '只想本机演示（面试官看共享屏幕）时：' -ForegroundColor DarkGray
    Write-Host "  http://127.0.0.1:$Port/demo"
  }
}
finally {
  Pop-Location
}
