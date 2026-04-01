-- Insert linux_server device type
INSERT INTO public.device_types (code, name, vendor, category, icon, is_active)
VALUES (
  'linux_server',
  'Linux Server',
  'Linux',
  'server',
  'Server',
  true
)
ON CONFLICT (code) DO NOTHING;

-- Insert blueprint with collection steps
INSERT INTO public.device_blueprints (
  device_type_id,
  name,
  description,
  executor_type,
  version,
  is_active,
  collection_steps
)
SELECT
  dt.id,
  'Linux Server Monitor',
  'Template-driven system metrics collection for Linux servers via /proc and statvfs',
  'monitor'::blueprint_executor_type,
  '1.0.0',
  true,
  '{
    "steps": [
      {
        "id": "cpu",
        "type": "proc_read",
        "label": "CPU & Load Average",
        "params": {"parser": "cpu"}
      },
      {
        "id": "mem",
        "type": "proc_read",
        "label": "Memória RAM",
        "params": {"parser": "memory"}
      },
      {
        "id": "disk",
        "type": "statvfs",
        "label": "Disco / Partições",
        "params": {"scan_mounts": true}
      },
      {
        "id": "net",
        "type": "proc_read",
        "label": "Interfaces de Rede",
        "params": {"parser": "net_interfaces"}
      },
      {
        "id": "sys",
        "type": "proc_read",
        "label": "Sistema (uptime, hostname, OS)",
        "params": {"parser": "system"}
      }
    ]
  }'::jsonb
FROM public.device_types dt
WHERE dt.code = 'linux_server';