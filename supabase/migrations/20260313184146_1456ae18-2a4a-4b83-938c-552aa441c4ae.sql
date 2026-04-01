-- Add spo_tenant_quota step to M365 hybrid blueprint
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[{
    "id": "spo_tenant_quota",
    "type": "powershell",
    "category": "SharePoint - Storage",
    "optional": true,
    "params": {
      "module": "PnP.PowerShell",
      "commands": [{
        "name": "spo_tenant_quota",
        "command": "Get-PnPTenant | Select-Object StorageQuota, StorageQuotaAllocated | ConvertTo-Json"
      }],
      "timeout": 60
    }
  }]'::jsonb
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';