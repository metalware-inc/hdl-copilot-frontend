#!/bin/bash
set -ex
echo "Unpacking AppImage..."

# If squashfs-root directory does not exist, extract the AppImage
arch=$(uname -m)
if [ "$arch" == "x86_64" ]; then
  binary_name="hdl_copilot_server_x86-64_packed"
elif [ "$arch" == "aarch64" ]; then
  binary_name="hdl_copilot_server_aarch64_packed"
elif [ "$arch" == "arm64" ]; then
  binary_name="hdl_copilot_server_aarch64_packed"
else
  echo "Unsupported architecture: $arch"
  exit 1
fi

echo "Using binary: $binary_name"

if [ ! -d "./squashfs-root" ]; then
  ./$binary_name --appimage-extract
  absolute_path=$(realpath ./squashfs-root/usr/bin/hdl_copilot_server)
  ln -s $absolute_path hdl_copilot_server
  echo "AppImage extracted successfully."
else
  echo "squashfs-root directory already exists. Skipping extraction."
fi
