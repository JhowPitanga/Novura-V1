import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseShippingPreferencesParams {
  organizationId: string | undefined;
  itemRow: any;
  currentStep: number;
}

/**
 * Loads shipping preferences from marketplace_integrations when on step 2.
 * Returns logistic types, selected type, Flex option and related setters.
 */
export function useShippingPreferences({
  organizationId,
  itemRow,
  currentStep,
}: UseShippingPreferencesParams) {
  const [availableLogisticTypes, setAvailableLogisticTypes] = useState<string[]>([]);
  const [selectedLogisticType, setSelectedLogisticType] = useState<string>("");
  const [preferFlex, setPreferFlex] = useState<boolean>(false);
  const [canUseFlex, setCanUseFlex] = useState<boolean>(false);

  useEffect(() => {
    const loadShippingPrefs = async () => {
      if (currentStep !== 2) return;
      if (!organizationId) return;
      try {
        const { data } = await (supabase as any)
          .from("marketplace_integrations")
          .select("shipping_preferences, drop_off, xd_drop_off, self_service, marketplace_name")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .limit(1)
          .single();
        const prefs = (data as any)?.shipping_preferences || {};
        const logistics = Array.isArray(prefs?.logistics) ? prefs.logistics : [];
        const types: string[] = [];
        let defType = "";
        logistics.forEach((entry: any) => {
          const arr = Array.isArray(entry?.types) ? entry.types : [];
          arr.forEach((t: any) => {
            const type = String(t?.type || "");
            const status = String(t?.status || "").toLowerCase();
            const isDefault = !!t?.default;
            if (status === "active" && type && type !== "fulfillment") types.push(type);
            if (isDefault && type && type !== "fulfillment") defType = type;
          });
        });
        const unique = Array.from(new Set(types));
        const allowed = ["xd_drop_off", "drop_off"];
        const onlyAllowed = unique.filter((u) => allowed.includes(String(u)));
        setAvailableLogisticTypes(onlyAllowed.length > 0 ? onlyAllowed : allowed);
        const sel = allowed.includes(defType) ? defType : (onlyAllowed[0] || "xd_drop_off");
        setSelectedLogisticType(sel);
        const hasSelfService = unique.includes("self_service");
        const canFlex = hasSelfService && ((data as any)?.self_service === true);
        setPreferFlex(!!(itemRow as any)?.cap_flex);
        setCanUseFlex(canFlex);
      } catch {}
    };
    loadShippingPrefs();
  }, [organizationId, itemRow, currentStep]);

  return {
    availableLogisticTypes,
    selectedLogisticType,
    setSelectedLogisticType,
    preferFlex,
    setPreferFlex,
    canUseFlex,
  };
}
