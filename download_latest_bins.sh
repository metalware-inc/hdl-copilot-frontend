#!/bin/bash
set -ex

# This script downmloads the latest backend binaries and places them in the correct directories
# in preparation for bundling the vscode extension.

# Define S3 bucket and paths
BUCKET="hdl-backend-releases"
LINUX_X86_64_PATH="latest/linux/hdl_copilot_server"
LINUX_ARM64_PATH="latest/linux-arm64/hdl_copilot_server"
WINDOWS_PATH="latest/windows/hdl_copilot_server.exe"

# Define local directories
LINUX_DIR="bin/linux"
WINDOWS_DIR="bin/windows"

# Check if aws cli is installed
if ! command -v aws &> /dev/null
then
    echo "AWS CLI not installed. Please install it first."
    exit 1
fi

# Downloading binaries
echo "Downloading X86-64 Linux binary..."
aws s3 cp "s3://$BUCKET/$LINUX_X86_64_PATH" "$LINUX_DIR/hdl_copilot_server_x86-64_packed"
chmod +x "$LINUX_DIR/hdl_copilot_server_x86-64_packed"

echo "Downloading ARM64 Linux binary..."
aws s3 cp "s3://$BUCKET/$LINUX_ARM64_PATH" "$LINUX_DIR/hdl_copilot_server_aarch64_packed"
chmod +x "$LINUX_DIR/hdl_copilot_server_aarch64_packed"

echo "Downloading Windows binary..."
aws s3 cp "s3://$BUCKET/$WINDOWS_PATH" "$WINDOWS_DIR/hdl_copilot_server.exe"
