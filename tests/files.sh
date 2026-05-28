#!/bin/bash

# 1. Save token to variable
TOKEN=$(curl -s -X POST "http://51.84.201.250:8001/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "adnan.agbaria@gmail.com", "password": "adnan123"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

echo "Token: $TOKEN"

curl -X GET "http://51.84.201.250:8001/files" \
  -H "Authorization: Bearer $TOKEN"

