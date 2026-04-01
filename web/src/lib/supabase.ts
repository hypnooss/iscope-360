import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1cGFiYXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDcxNjYwNjcsImV4cCI6MjAyMjc0MjA2N30.xxx"; // O anon key dev pattern do local supabase

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
