import { useQuery } from "@tanstack/react-query";
import {
  fetchTaxRulesCatalog,
  mapTaxRulesToOptions,
  type CSOSNOption,
} from "@/services/tax.service";

export const taxRulesCatalogKeys = {
  all: ["tax-rules-catalog"] as const,
};

export function useTaxRulesCatalog(): {
  csosnICMSOptions: CSOSNOption[];
  cstIPIOptions: CSOSNOption[];
  cstPISOptions: CSOSNOption[];
  cstCOFINSOptions: CSOSNOption[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: taxRulesCatalogKeys.all,
    queryFn: fetchTaxRulesCatalog,
    staleTime: 30 * 60 * 1000,
  });

  const options = mapTaxRulesToOptions(data || []);

  return {
    ...options,
    isLoading,
  };
}
