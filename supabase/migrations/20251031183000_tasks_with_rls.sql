-- Tasks: tabela de gestão de tarefas com visibilidade por organização e regras de acesso
-- Cria tabela, índices e políticas RLS para suportar:
-- - Organização específica (organizations_id)
-- - Visibilidade: 'private', 'team', 'members'
-- - Lista de membros selecionados (visible_to_members)

BEGIN;

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  type text NOT NULL DEFAULT 'task' CHECK (type IN ('story','bug','task','epic')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  due_date date NULL,
  time_tracked integer NOT NULL DEFAULT 0,
  labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  dependencies BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private','team','members')),
  visible_to_members uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_tasks_org ON public.tasks (organizations_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);

-- 3) Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_set_updated_at'
  ) THEN
    CREATE TRIGGER tasks_set_updated_at
      BEFORE UPDATE ON public.tasks
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) RLS e Políticas
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: membros da organização podem ver conforme visibilidade
DROP POLICY IF EXISTS "Tasks: select visible to member" ON public.tasks;
CREATE POLICY "Tasks: select visible to member"
ON public.tasks
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
  AND (
    visibility = 'team'
    OR (visibility = 'private' AND (auth.uid() = created_by OR auth.uid() = assigned_to))
    OR (visibility = 'members' AND (
      auth.uid() = created_by
      OR auth.uid() = assigned_to
      OR auth.uid() = ANY(visible_to_members)
    ))
  )
);

-- INSERT: qualquer membro da organização pode criar
DROP POLICY IF EXISTS "Tasks: insert by org member" ON public.tasks;
CREATE POLICY "Tasks: insert by org member"
ON public.tasks
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

-- UPDATE: creator, assignee ou owners/admins podem atualizar
DROP POLICY IF EXISTS "Tasks: update by creator, assignee or admins" ON public.tasks;
CREATE POLICY "Tasks: update by creator, assignee or admins"
ON public.tasks
FOR UPDATE
USING (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
  OR auth.uid() = created_by
  OR auth.uid() = assigned_to
)
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

-- DELETE: owners/admins ou creator podem apagar
DROP POLICY IF EXISTS "Tasks: delete by owner/admin or creator" ON public.tasks;
CREATE POLICY "Tasks: delete by owner/admin or creator"
ON public.tasks
FOR DELETE
USING (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
  OR auth.uid() = created_by
);

COMMIT;