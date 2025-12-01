-- Add delete policy for marketplace_drafts
create policy "org members can delete drafts" on public.marketplace_drafts
  for delete using (
    public.is_org_member(auth.uid(), organizations_id)
  );

