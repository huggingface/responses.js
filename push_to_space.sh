#!/bin/bash

# Define the header content
HEADER='---
title: Responses.js
emoji: 😻
colorFrom: red
colorTo: red
sdk: docker
pinned: false
license: mit
short_description: Check out https://github.com/huggingface/responses.js
app_port: 3000
---


'

# 1. Backup and prepend header to README.md
cp README.md README.bak
echo "$HEADER$(cat README.bak)" > README.md

# 2. Run the huggingface upload command
huggingface-cli upload responses.js . --include "package.json" "pnpm-lock.yaml" "tsconfig.json" "README.md" "Dockerfile" "src/**" --repo-type "space"

# 3. Restore original README.md
mv README.bak README.md
