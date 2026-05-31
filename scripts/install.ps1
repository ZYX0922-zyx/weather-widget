# 兼容旧入口：打开图形安装/卸载页面
$hta = Join-Path $PSScriptRoot "..\installer\setup.hta"
Start-Process -FilePath "$env:SystemRoot\System32\mshta.exe" -ArgumentList "`"$hta`""
exit 0
