/**
 * TanStack Query useMutation wrapper for product root creation.
 * Replaces the raw useState-based createProduct in useProducts.ts useCreateProduct.
 *
 * The mutation payload includes user_id, company_id, organizations_id because
 * useProductForm (the caller) resolves those values before calling createProduct.
 * products.service.createProductRoot handles the actual insert.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createProductRoot, productKeys, fetchDefaultCompanyId } from '@/services/products.service';

export interface CreateProductPayload extends Record<string, unknown> {
  type: 'UNICO' | 'VARIACAO_PAI' | 'VARIACAO_ITEM' | 'KIT';
  user_id?: string;
  company_id?: string;
  organizations_id?: string;
}

/**
 * Mirrors the original useCreateProduct.createProduct logic:
 *   - resolves auth user
 *   - ensures parent_id: null for root types
 *   - falls back to get_current_user_organization_id if company_id is missing
 *   - calls createProductRoot (supabase insert)
 */
async function createProductFn(productData: CreateProductPayload): Promise<{ id: string }> {
  const { data: authUserData } = await supabase.auth.getUser();
  const authUserId = authUserData?.user?.id;
  if (!authUserId) throw new Error('Sessão inválida ou expirada');

  let payload: Record<string, unknown> = {
    ...productData,
    user_id: productData?.user_id ?? authUserId,
  };

  const t = payload.type as string | undefined;
  if (t === 'UNICO' || t === 'VARIACAO_PAI' || t === 'KIT') {
    payload = { ...payload, parent_id: null };
  }

  if (!payload.company_id) {
    try {
      const { data: orgId } = await supabase.rpc('get_current_user_organization_id');
      const organizationId = Array.isArray(orgId) ? orgId?.[0] : orgId;
      if (organizationId) {
        const companyId = await fetchDefaultCompanyId(organizationId);
        if (companyId) payload = { ...payload, company_id: companyId };
        payload = { ...payload, organizations_id: organizationId };
      }
    } catch { /* noop */ }
  }

  return createProductRoot(payload);
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProductFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}
