#requires -Version 5.1
<#
.SYNOPSIS
  关闭 LiteClaw 本地演示：杀掉指定端口上的监听进程（默认 5400 演示、3000 后端）以及隧道进程。

.DESCRIPTION
  只按端口精确定位并结束进程，不会用 taskkill /IM node.exe 这种宽泛方式，
  避免误杀编辑器、DSH 会话或其它项目的 node 进程。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\stop-demo.ps1
  powershell -ExecutionPolicy Bypass -File scripts\stop-demo.ps1 -Ports 5400
#>
param(
  [int[]]$Ports = @(5400, 3000)
)

$stopped = 0
foreach ($port in $Ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) {
    Write-Host "端口 $port：无监听" -ForegroundColor DarkGray
    continue
  }
  foreach ($listener in $listeners) {
    $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if (-not $proc) {
      Write-Host "端口 $port：pid=$($listener.OwningProcess) 已不存在" -ForegroundColor DarkGray
      continue
    }
    if ($proc.ProcessName -match '^(node|electron|npm)$') {
      Stop-Process -Id $proc.Id -Force
      Write-Host "已停止 $($proc.ProcessName) pid=$($proc.Id)（端口 $port）" -ForegroundColor Green
      $stopped++
    }
    else {
      Write-Host "跳过端口 $port 上的 $($proc.ProcessName) pid=$($proc.Id)（不是 node/electron）" -ForegroundColor Yellow
    }
  }
}

Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.Id -Force
  Write-Host "已停止 cloudflared pid=$($_.Id)" -ForegroundColor Green
  $script:stopped++
}
Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.Id -Force
  Write-Host "已停止 ngrok pid=$($_.Id)" -ForegroundColor Green
  $script:stopped++
}

if ($stopped -eq 0) { Write-Host '没有需要停止的进程。' -ForegroundColor DarkGray }

Start-Sleep -Milliseconds 500
foreach ($port in $Ports) {
  $left = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $state = if ($left) { '仍在监听' } else { '已释放' }
  Write-Host ("端口 {0}：{1}" -f $port, $state) -ForegroundColor DarkGray
}
