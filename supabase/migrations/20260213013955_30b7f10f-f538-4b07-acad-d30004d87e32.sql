UPDATE attack_surface_tasks 
SET status = 'completed', completed_at = NOW()
WHERE id IN (
  '762fdae1-281f-4cb3-b193-2b0bdc078bd0',
  '36a95492-c753-4e5e-8f53-6f6009105ddf',
  'bb05b14b-c54f-4ab7-bcae-1282b19402c7',
  'aed245f4-6d81-4984-817c-612b41d56891'
);

UPDATE attack_surface_snapshots
SET status = 'completed', completed_at = NOW()
WHERE id = '22e62639-be20-4291-8c6b-45ba827d24c0';