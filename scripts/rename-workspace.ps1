#requires -Version 5.1
<#
.SYNOPSIS
  把工作区目录从 miniclaw-main 正式改名为 liteclaw。

.DESCRIPTION
  DSH / 编辑器 / 终端会持有目录句柄，重命名会被系统拒绝（访问被拒绝）。
  本脚本按顺序处理：
    1. 若目标路径存在且是 junction（临时占位），先只删除链接，不动数据；
    2. 列出仍在引用旧路径的进程，提示先关闭它们；
    3. 尝试 Rename-Item，成功后打印后续步骤。

  注意：正式改名后，DSH 旧会话记录的工作区路径仍是 F:\miniclaw-main，
  需要以 F:\liteclaw 重新打开工作区（旧会话可能显示目录不存在）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\rename-workspace.ps1 -Check
  powershell -ExecutionPolicy Bypass -File scripts\rename-workspace.ps1
#>
param(
  [string]$OldPath = 'F:\miniclaw-main',
  [string]$NewPath = 'F:\liteclaw',
  [switch]$Check,
  [switch]$KeepAlias
)

$ErrorActionPreference = 'Stop'

function Show-Holders {
  param([string]$Path)
  $holders = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Path, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |
    Select-Object ProcessId, Name, @{ n = 'Command'; e = { $_.CommandLine.Substring(0, [Math]::Min(90, $_.CommandLine.Length)) } }
  if ($holders) {
    Write-Host '仍在引用该路径的进程：' -ForegroundColor Yellow
    $holders | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host '请先关闭上面这些程序（DSH 会话、VS Code、资源管理器窗口、终端）。' -ForegroundColor Yellow
  }
  else {
    Write-Host '没有进程在命令行里直接引用该路径（仍可能存在句柄占用）。' -ForegroundColor DarkGray
  }
}

if (-not (Test-Path -LiteralPath $OldPath)) {
  if (Test-Path -LiteralPath $NewPath) {
    Write-Host "$OldPath 不存在，$NewPath 已就绪，无需改名。" -ForegroundColor Green
    exit 0
  }
  throw "旧路径 $OldPath 不存在。"
}

$target = Get-Item -LiteralPath $NewPath -Force -ErrorAction SilentlyContinue
$targetIsLink = $target -and ($target.Attributes -band [IO.FileAttributes]::ReparsePoint)
if ($target -and -not $targetIsLink) {
  throw "$NewPath 已存在且不是 junction，请先手动处理该目录。"
}

if ($Check) {
  Write-Host "旧路径: $OldPath"
  Write-Host ("新路径: {0}（{1}）" -f $NewPath, $(if ($targetIsLink) { '当前是临时 junction' } else { '不存在' }))
  Show-Holders -Path $OldPath
  Write-Host '这是检查模式，未做任何改动。' -ForegroundColor DarkGray
  exit 0
}

if ($targetIsLink) {
  cmd /c rmdir $NewPath | Out-Null
  Write-Host "已移除临时 junction：$NewPath（数据未删除）" -ForegroundColor DarkGray
}

try {
  Rename-Item -LiteralPath $OldPath -NewName (Split-Path -Leaf $NewPath) -ErrorAction Stop
}
catch {
  Write-Host ('改名失败：' + $_.Exception.Message) -ForegroundColor Red
  Show-Holders -Path $OldPath
  Write-Host ''
  Write-Host '处理办法：关闭 DSH 应用（以及 VS Code、资源管理器里打开的该目录、相关终端），' -ForegroundColor Yellow
  Write-Host '然后在普通 PowerShell 里重新执行本脚本。' -ForegroundColor Yellow
  if ($targetIsLink) {
    cmd /c mklink /J $NewPath $OldPath | Out-Null
    Write-Host "（已恢复 $NewPath 的临时 junction，保证路径仍可用）" -ForegroundColor DarkGray
  }
  exit 1
}

Write-Host "改名完成：$OldPath  ->  $NewPath" -ForegroundColor Green

if ($KeepAlias) {
  cmd /c mklink /J $OldPath $NewPath | Out-Null
  if (Test-Path -LiteralPath $OldPath) {
    Write-Host "已保留旧路径别名：$OldPath  ->  $NewPath（让旧会话/书签继续可用；不需要时 cmd /c rmdir `"$OldPath`" 删除）" -ForegroundColor DarkGray
  }
}

Write-Host ''
Write-Host '后续：' -ForegroundColor Cyan
Write-Host '  1. 用 DSH 重新打开工作区目录 F:\liteclaw（旧会话里记录的是 F:\miniclaw-main，会提示路径不存在）。'
Write-Host '  2. 终端先 cd F:\liteclaw 再继续 npm / git 操作。'
Write-Host '  3. git 仓库随目录一起移动，remote 与提交历史不受影响。'
