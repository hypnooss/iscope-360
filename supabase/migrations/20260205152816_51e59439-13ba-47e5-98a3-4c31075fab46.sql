-- Insert missing roles for users without a role entry
INSERT INTO user_roles (user_id, role)
SELECT p.id, 'user'::app_role
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
WHERE ur.user_id IS NULL;