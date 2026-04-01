-- Add color column to modules table
ALTER TABLE modules 
ADD COLUMN color TEXT DEFAULT 'text-primary';

-- Update existing modules with appropriate colors
UPDATE modules SET color = 'text-orange-500' WHERE code = 'scope_firewall';
UPDATE modules SET color = 'text-blue-500' WHERE code = 'scope_m365';
UPDATE modules SET color = 'text-cyan-500' WHERE code = 'scope_network';
UPDATE modules SET color = 'text-purple-500' WHERE code = 'scope_cloud';