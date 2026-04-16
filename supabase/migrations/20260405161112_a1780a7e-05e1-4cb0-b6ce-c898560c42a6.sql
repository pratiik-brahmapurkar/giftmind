INSERT INTO user_roles (user_id, role)
SELECT id, 'superadmin'
FROM auth.users
WHERE email = 'pbrahmapurkar@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
