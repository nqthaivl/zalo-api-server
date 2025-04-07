# Zalo Data Directory

This directory contains persistent data for the Zalo server Docker container, including:

1. Credential files (`cred_*.json`) for Zalo accounts
2. Configuration files (`proxies.json` and `webhook-config.json`)

## Important Notes

- All Zalo account credentials will be stored here for persistence across container restarts
- When the container restarts, it will automatically attempt to log in using these saved credentials
- You can modify `webhook-config.json` to update webhook URLs
- You can modify `proxies.json` to update available proxies

## Directory Structure

```
zalo_data/
├── cred_123456789.json   # Credential files for Zalo accounts
├── cred_987654321.json
├── proxies.json          # Proxy configuration
└── webhook-config.json   # Webhook URL configuration
``` 