
UPDATE public.device_blueprints
SET collection_steps = '{
  "steps": [
    {"id": "cpu",  "type": "proc_read", "label": "CPU & Load Average",              "params": {"parser": "cpu"},            "interval_seconds": 60},
    {"id": "mem",  "type": "proc_read", "label": "Memória RAM",                     "params": {"parser": "memory"},         "interval_seconds": 60},
    {"id": "disk", "type": "statvfs",   "label": "Disco / Partições",               "params": {"scan_mounts": true},        "interval_seconds": 120},
    {"id": "net",  "type": "proc_read", "label": "Interfaces de Rede",              "params": {"parser": "net_interfaces"}, "interval_seconds": 30},
    {"id": "sys",  "type": "proc_read", "label": "Sistema (uptime, hostname, OS)",  "params": {"parser": "system"},         "interval_seconds": 3600}
  ]
}'::jsonb,
updated_at = now()
WHERE id = 'aef7d3b8-dd7f-4096-9e5e-68df11d7cc2c';
