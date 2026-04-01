
INSERT INTO public.attack_surface_schedules (client_id, frequency, scheduled_hour, is_active, next_run_at)
VALUES
  ('62842720-92b9-42c9-ae91-16cdaad9284d', 'daily', 15, true, (CURRENT_DATE + 1)::timestamp + INTERVAL '15 hours'),
  ('c5e3878a-0395-4952-b055-277893f66e95', 'daily', 15, true, (CURRENT_DATE + 1)::timestamp + INTERVAL '15 hours'),
  ('57fabbc4-6bf8-442e-9948-240a7e44cc2d', 'daily', 15, true, (CURRENT_DATE + 1)::timestamp + INTERVAL '15 hours'),
  ('80e94e71-1cc4-402c-b718-e021f5e81cb2', 'daily', 15, true, (CURRENT_DATE + 1)::timestamp + INTERVAL '15 hours'),
  ('145988e9-14b5-49ca-b1e6-c9184cba86f0', 'daily', 15, true, (CURRENT_DATE + 1)::timestamp + INTERVAL '15 hours'),
  ('794942aa-05c3-49d5-bd57-4563081c76a2', 'daily', 15, true, (CURRENT_DATE + 1)::timestamp + INTERVAL '15 hours');
