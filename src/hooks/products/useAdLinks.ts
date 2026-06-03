/**
 * TanStack Query hooks for ad-link state in ProductAdLinkingPanel.
 * Replaces 5 useEffect + manual loading state patterns.
 *
 * Exports: useAdLinks(productId, organizationId, allowMutations, onLinksMutation)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  fetchExistingLinks,
  fetchActiveIntegrations,
  linkProductToAd,
  unlinkProductFromAd,
  adLinkKeys,
  type ExistingLinkRow,
} from '@/services/productAdLinks.service';

export function useAdLinks(
  productId: string | null,
  organizationId: string | undefined,
  allowMutations: boolean,
  onLinksMutation?: () => void
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: adLinkKeys.links(productId ?? '', organizationId ?? ''),
    queryFn: () => fetchExistingLinks(productId!, organizationId!),
    enabled: Boolean(productId && organizationId),
    staleTime: 60_000,
  });

  const integrationsQuery = useQuery({
    queryKey: adLinkKeys.integrations(organizationId ?? ''),
    queryFn: () => fetchActiveIntegrations(organizationId!),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
  });

  const invalidateLinks = () => {
    if (productId && organizationId) {
      queryClient.invalidateQueries({ queryKey: adLinkKeys.links(productId, organizationId) });
    }
  };

  const linkMutation = useMutation({
    mutationFn: (item: { marketplace_name: string; marketplace_item_id: string; variation_id?: string }) =>
      linkProductToAd({ organizationId: organizationId!, productId: productId!, item }),
    onSuccess: (_data, item) => {
      toast({ title: 'Vínculo criado', description: `"${(item as any).title || item.marketplace_item_id}" vinculado ao produto.` });
      invalidateLinks();
      onLinksMutation?.();
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err?.message || 'Erro ao vincular anúncio.', variant: 'destructive' });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (link: ExistingLinkRow) =>
      unlinkProductFromAd({ organizationId: organizationId!, productId: productId!, link }),
    onSuccess: () => {
      toast({ title: 'Vínculo removido' });
      invalidateLinks();
      onLinksMutation?.();
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err?.message, variant: 'destructive' });
    },
  });

  const handleLink = async (item: { marketplace_name: string; marketplace_item_id: string; variation_id?: string; title?: string }) => {
    if (!allowMutations) {
      toast({ title: 'Salve o produto primeiro', description: 'Conclua o cadastro para poder vincular anúncios a este produto.' });
      return;
    }
    if (!productId || !organizationId) {
      toast({ title: 'Aviso', description: 'Salve o produto antes de vincular anúncios.', variant: 'destructive' });
      return;
    }
    await linkMutation.mutateAsync(item);
  };

  const handleUnlink = async (link: ExistingLinkRow) => {
    if (!allowMutations || !productId || !organizationId) return;
    await unlinkMutation.mutateAsync(link);
  };

  return {
    existingLinks: (linksQuery.data ?? []) as ExistingLinkRow[],
    activeDbMarketplaceNames: integrationsQuery.data ?? [],
    integrationsQueryDone: !integrationsQuery.isLoading,
    itemsQueryDone: true,
    linking: linkMutation.isPending ? (linkMutation.variables as any)?.id ?? null : null,
    handleLink,
    handleUnlink,
  };
}
