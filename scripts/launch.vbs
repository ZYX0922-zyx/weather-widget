' 后台启动天气组件（无黑窗口），并应用安装时保存的语言
Option Explicit

Dim fso, sh, root, ps1, cmd, settingsPath, ts, raw, re, lang

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
ps1 = root & "\launcher.ps1"

If Not fso.FileExists(ps1) Then
  MsgBox "找不到启动脚本: " & ps1, vbCritical, "天气组件"
  WScript.Quit 1
End If

settingsPath = sh.ExpandEnvironmentStrings("%APPDATA%\weather-widget\settings.json")
If fso.FileExists(settingsPath) Then
  Set ts = fso.OpenTextFile(settingsPath, 1, False, -1)
  raw = ts.ReadAll()
  ts.Close()
  Set re = New RegExp
  re.Pattern = """lang""\s*:\s*""([^""]+)"""
  re.IgnoreCase = True
  If re.Test(raw) Then
    lang = re.Execute(raw)(0).SubMatches(0)
    If lang <> "" Then
      sh.Environment("PROCESS")("WIDGET_LANG") = lang
    End If
  End If
End If

sh.CurrentDirectory = root
sh.Environment("PROCESS")("WIDGET_SILENT") = "1"
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
