#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
服务器状态检查脚本

使用前请设置环境变量:
  Windows PowerShell:
    $env:DEPLOY_HOST = "your.server.ip"
    $env:DEPLOY_USER = "root"
    $env:DEPLOY_PASSWORD = "your_password"
  
  Linux/Mac:
    export DEPLOY_HOST=your.server.ip
    export DEPLOY_USER=root
    export DEPLOY_PASSWORD=your_password
"""

import os
import sys

HOST = os.environ.get('DEPLOY_HOST')
USERNAME = os.environ.get('DEPLOY_USER', 'root')
PASSWORD = os.environ.get('DEPLOY_PASSWORD')
PROJECT_PATH = os.environ.get('PROJECT_PATH', '/www/wwwroot/flashphoto')

if not HOST or not PASSWORD:
    print("错误: 请设置环境变量 DEPLOY_HOST 和 DEPLOY_PASSWORD")
    print("\nWindows PowerShell:")
    print('  $env:DEPLOY_HOST = "your.server.ip"')
    print('  $env:DEPLOY_PASSWORD = "your_password"')
    sys.exit(1)

try:
    import paramiko
except ImportError:
    print("请先安装 paramiko: pip install paramiko")
    sys.exit(1)

print(f"连接到 {HOST}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USERNAME, password=PASSWORD, timeout=30)
print("已连接\n")

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print(f"[stderr] {err}")
    return out

print("=== Docker 容器状态 ===")
run("docker ps -a --format 'table {{.Names}}\t{{.Status}}' | head -15")

print("\n=== admin-api 日志 (最近 30 行) ===")
run("docker logs flashphoto-admin-api --tail 30 2>&1")

print("\n=== 检查环境变量 ===")
run("docker exec flashphoto-admin-api env | grep -E 'JWT_|COS_|WX_' 2>/dev/null || echo '容器可能未运行'")

ssh.close()
print("\n检查完成")
