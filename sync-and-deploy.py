#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
醒美闪图 - 同步并远程部署脚本
用法: python sync-and-deploy.py

功能:
1. 读取 .env.deploy 配置
2. 使用 SSH 同步修改的文件到服务器
3. 在服务器上执行部署命令
"""

import os
import sys
import time

def load_env_deploy():
    """从 .env.deploy 读取配置"""
    config = {}
    env_file = os.path.join(os.path.dirname(__file__), '.env.deploy')

    if not os.path.exists(env_file):
        print("错误: 找不到 .env.deploy 文件")
        sys.exit(1)

    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                config[key.strip()] = value.strip()

    return config

def main():
    # 检查 paramiko
    try:
        import paramiko
        from scp import SCPClient
    except ImportError:
        print("请先安装依赖: pip install paramiko scp")
        sys.exit(1)

    # 加载配置
    config = load_env_deploy()

    SERVER_IP = config.get('SERVER_IP')
    SERVER_USER = config.get('SERVER_USER', 'root')
    SERVER_PASSWORD = config.get('SERVER_PASSWORD')
    REMOTE_PATH = '/www/wwwroot/flashphoto'

    print("=" * 50)
    print("  醒美闪图 - 同步部署")
    print("=" * 50)
    print(f"服务器: {SERVER_IP}")
    print(f"路径: {REMOTE_PATH}")
    print()

    # 需要同步的文件
    files_to_sync = [
        "docker-compose.optimized.yml",
        "docker/nginx/nginx.docker.conf",
        "docker/nginx/conf.d/docker.conf",
        "docker/nginx/ssl/README.md",
        "docker/deploy-optimized.sh",
        "CLAUDE.md",
    ]

    # 连接服务器
    print("[1/4] 连接服务器...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(SERVER_IP, username=SERVER_USER, password=SERVER_PASSWORD, timeout=30)
        print(f"  已连接到 {SERVER_IP}")
    except Exception as e:
        print(f"连接失败: {e}")
        sys.exit(1)

    # 同步文件
    print()
    print("[2/4] 同步文件到服务器...")

    project_dir = os.path.dirname(os.path.abspath(__file__))

    with SCPClient(ssh.get_transport()) as scp:
        for file_path in files_to_sync:
            local_path = os.path.join(project_dir, file_path)
            remote_file = f"{REMOTE_PATH}/{file_path}"

            if os.path.exists(local_path):
                # 确保远程目录存在
                remote_dir = os.path.dirname(remote_file)
                ssh.exec_command(f"mkdir -p {remote_dir}")
                time.sleep(0.1)

                # 上传文件
                print(f"  上传: {file_path}")
                scp.put(local_path, remote_file)
            else:
                print(f"  跳过 (不存在): {file_path}")

    # 执行部署命令
    print()
    print("[3/4] 在服务器上执行部署...")

    commands = [
        f"cd {REMOTE_PATH}",
        "echo '停止旧服务...'",
        "docker compose down 2>/dev/null || true",
        "docker compose -f docker-compose.optimized.yml down 2>/dev/null || true",
        "echo '重命名旧配置文件...'",
        "mv docker/nginx/conf.d/default.conf docker/nginx/conf.d/default.conf.bak 2>/dev/null || true",
        "mv docker/nginx/conf.d/pop-pub.com.optimized.conf docker/nginx/conf.d/pop-pub.com.optimized.conf.bak 2>/dev/null || true",
        "echo '启动新架构...'",
        "bash docker/deploy-optimized.sh start",
    ]

    full_command = " && ".join(commands)

    stdin, stdout, stderr = ssh.exec_command(full_command, timeout=300)

    # 实时输出
    for line in stdout:
        print(f"  {line.strip()}")

    err = stderr.read().decode()
    if err:
        print(f"  [警告] {err}")

    # 查看状态
    print()
    print("[4/4] 查看服务状态...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_PATH} && docker compose -f docker-compose.optimized.yml ps")
    for line in stdout:
        print(f"  {line.strip()}")

    ssh.close()

    print()
    print("=" * 50)
    print("  部署完成!")
    print("=" * 50)
    print()
    print("访问地址:")
    print("  后台管理: https://pop-pub.com/admin")
    print("  健康检查: https://pop-pub.com/health")

if __name__ == '__main__':
    main()
