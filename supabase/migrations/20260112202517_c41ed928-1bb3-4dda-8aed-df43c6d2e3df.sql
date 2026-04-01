-- Corrigir política de INSERT em profiles para ser mais segura
-- A política anterior era necessária para o trigger, mas vamos limitar para que apenas
-- o próprio usuário possa criar seu perfil ou que seja via trigger (SECURITY DEFINER)
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;

-- Criar política que permite INSERT apenas quando auth.uid() = id (o usuário criando seu próprio perfil)
-- O trigger usa SECURITY DEFINER então não precisa da policy
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);