-- Tabela para auditoria de sessões de preview/impersonate
CREATE TABLE public.preview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_workspace_id uuid REFERENCES public.clients(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reason text,
  ip_address text,
  user_agent text,
  mode text NOT NULL DEFAULT 'preview', -- 'preview' ou 'impersonate' (futuro)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index para buscas frequentes
CREATE INDEX idx_preview_sessions_admin_id ON public.preview_sessions(admin_id);
CREATE INDEX idx_preview_sessions_target_user_id ON public.preview_sessions(target_user_id);
CREATE INDEX idx_preview_sessions_active ON public.preview_sessions(admin_id) WHERE ended_at IS NULL;

-- RLS: Apenas super_admin/super_suporte podem ver/criar
ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins and super_suporte can manage preview sessions"
ON public.preview_sessions
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'super_suporte'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'super_suporte'::app_role)
);

-- Comentários para documentação
COMMENT ON TABLE public.preview_sessions IS 'Auditoria de sessões de visualização/impersonate de usuários';
COMMENT ON COLUMN public.preview_sessions.mode IS 'preview = somente leitura, impersonate = acesso completo (futuro)';