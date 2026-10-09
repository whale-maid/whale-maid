@echo off
rem CodeBuddy Code CLI 启动器（工作区本地安装；说明见 tools/AGENTS.md）
rem 首次使用：运行本文件进入交互界面，输入 /login 完成登录（微信/Google 扫码）。
rem 凭据落在 %USERPROFILE%\.codebuddy\.credentials.json，ACP 子进程会自动复用。
rem 需要无色输出（给 agent 解析）时：set NO_COLOR=1 后再调用。
setlocal
if not defined NO_COLOR set NO_COLOR=
"%~dp0node_modules\.bin\codebuddy.cmd" %*
endlocal
