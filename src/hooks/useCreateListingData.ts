import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseCreateListingDataParams {
  organizationId: string | null;
  categoryId: string;
  siteId: string;
  isShopeeMode: boolean;
  currentStep: number;
  listingTypeId: string;
  setListingTypeId: (id: string) => void;
  attributes: any[];
  price: string;
  shipping: any;
  setShipping: (v: any) => void;
  sessionCacheRef: React.MutableRefObject<any>;
}

export function useCreateListingData({
  organizationId,
  categoryId,
  siteId,
  isShopeeMode,
  currentStep,
  listingTypeId,
  setListingTypeId,
  attributes,
  price,
  shipping,
  setShipping,
  sessionCacheRef,
}: UseCreateListingDataParams) {
  const [fetchGate, setFetchGate] = useState<{ s1: boolean; s3: boolean; s6: boolean; s7: boolean }>({ s1: false, s3: false, s6: false, s7: false });
  const [attrsMeta, setAttrsMeta] = useState<any[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);
  const [techSpecsInput, setTechSpecsInput] = useState<any>(null);
  const [techSpecsOutput, setTechSpecsOutput] = useState<any>(null);
  const [saleTermsMeta, setSaleTermsMeta] = useState<any[]>([]);
  const [listingTypes, setListingTypes] = useState<any[]>([]);
  const [loadingListing, setLoadingListing] = useState(false);
  const [listingPriceOptions, setListingPriceOptions] = useState<any[]>([]);
  const [shippingModesAvailable, setShippingModesAvailable] = useState<string[]>([]);
  const [shippingLogisticsByMode, setShippingLogisticsByMode] = useState<Record<string, string[]>>({});
  const [shippingLogisticsDefaults, setShippingLogisticsDefaults] = useState<Record<string, string>>({});
  const [availableLogisticTypes, setAvailableLogisticTypes] = useState<string[]>([]);
  const [selectedLogisticType, setSelectedLogisticType] = useState<string>("");
  const [freeShipMandatoryCfg, setFreeShipMandatoryCfg] = useState<boolean>(false);
  const [freeShippingMandatory, setFreeShippingMandatory] = useState<boolean>(false);
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [shopeeBrandList, setShopeeBrandList] = useState<any[]>([]);
  const [conditionalRequiredIds, setConditionalRequiredIds] = useState<string[]>([]);
  const [lastCategoryLoaded, setLastCategoryLoaded] = useState<string>("");

  const [debouncedPrice, setDebouncedPrice] = useState<string>(price);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedPrice(price), 500);
    return () => clearTimeout(h);
  }, [price]);

  const attrSig = useMemo(() => {
    const base = (attributes || []).map((a: any) => ({ id: String(a?.id || ""), vid: (a as any)?.value_id ?? null, vn: (a as any)?.value_name ?? null }));
    try { return JSON.stringify(base); } catch { return String(base.length); }
  }, [attributes]);
  const [debouncedAttrSig, setDebouncedAttrSig] = useState<string>(attrSig);
  const [conditionalTrigger, setConditionalTrigger] = useState<number>(0);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedAttrSig(attrSig), 600);
    return () => clearTimeout(h);
  }, [attrSig]);

  const triggerConditionalEval = useCallback(() => setConditionalTrigger((n) => n + 1), []);

  useEffect(() => {
    const cat = String(categoryId || "");
    if (!cat) return;
    if (lastCategoryLoaded && lastCategoryLoaded !== cat) {
      sessionCacheRef.current = { attrsMetaByCategory: {}, techInputByCategory: {}, saleTermsMetaByCategory: {}, listingTypesByCategory: {}, listingPriceOptionsByKey: {}, brandListByCategory: {} };
      setLastCategoryLoaded("");
    }
  }, [categoryId, lastCategoryLoaded, sessionCacheRef]);

  // Effect 1: loadApps — fetches connectedApps when currentStep === 1
  useEffect(() => {
    const loadApps = async () => {
      if (!organizationId) return;
      if (currentStep !== 1) return;
      const { data, error } = await (supabase as any)
        .from("marketplace_integrations")
        .select("marketplace_name")
        .eq("organizations_id", organizationId);
      if (error) return;
      const names: string[] = (data || []).map((r: any) => String(r?.marketplace_name || ""));
      const mapped: string[] = names.map((n) => (n === "mercado_livre" ? "Mercado Livre" : n));
      const clean: string[] = Array.from(new Set<string>(mapped)).filter((n): n is string => !!n);
      setConnectedApps(clean);
    };
    loadApps();
  }, [organizationId, currentStep]);

  // Effect 2: fetchAttrs — fetches ML/Shopee attributes
  useEffect(() => {
    const fetchAttrs = async () => {
      if (!organizationId || !categoryId) return;
      if (isShopeeMode ? (currentStep !== 4 && currentStep !== 5) : (currentStep !== 3)) return;
      if (!fetchGate.s3) return;
      if (Array.isArray(attrsMeta) && attrsMeta.length > 0 && lastCategoryLoaded === String(categoryId || "")) return;
      setLoadingAttrs(true);
      try {
        if (isShopeeMode) {
          const cat = String(categoryId || "");
          const cachedAttrs = sessionCacheRef.current.attrsMetaByCategory[cat];
          const cachedBrands = sessionCacheRef.current.brandListByCategory[cat];
          if (Array.isArray(cachedAttrs) && cachedAttrs.length > 0) {
            setAttrsMeta(cachedAttrs);
            if (Array.isArray(cachedBrands)) setShopeeBrandList(cachedBrands);
            setLastCategoryLoaded(cat);
            return;
          }
          const attrsRes = await (supabase as any).functions.invoke("shopee-product-attributes", { body: { organizationId, category_id: categoryId, language: "pt-BR" } });
          if (!attrsRes.error) {
            const payload = (attrsRes.data as any) || {};
            const listData = Array.isArray((payload as any)?.data?.attribute_list) ? (payload as any).data.attribute_list : (Array.isArray((payload as any)?.data?.attribute_tree) ? (payload as any).data.attribute_tree : []);
            const listResp = Array.isArray((payload as any)?.response?.attribute_list) ? (payload as any).response.attribute_list : (Array.isArray((payload as any)?.response?.attribute_tree) ? (payload as any).response.attribute_tree : []);
            const listRoot = Array.isArray((payload as any)?.attribute_list) ? (payload as any).attribute_list : (Array.isArray((payload as any)?.attribute_tree) ? (payload as any).attribute_tree : []);
            const listAny = Array.isArray((payload as any)?.list) ? (payload as any).list : [];
            const list: any[] = (listAny.length ? listAny : (listData.length ? listData : (listResp.length ? listResp : listRoot)));
            const mapped = list.map((a: any) => {
              const idNum = typeof a?.attribute_id === "number" ? a.attribute_id : Number(a?.attribute_id || 0);
              const idStr = Number.isFinite(idNum) ? String(idNum) : String(a?.attribute_id || "");
              const nameStr = String(a?.attribute_name || a?.name || idStr || "");
              const opts = Array.isArray(a?.option_list) ? a.option_list : (Array.isArray(a?.options) ? a.options : []);
              const values = Array.isArray(opts) ? opts.map((o: any) => {
                const oidNum = typeof o?.option_id === "number" ? o.option_id : Number(o?.id || 0);
                const oid = Number.isFinite(oidNum) ? String(oidNum) : String(o?.option_id || o?.id || "");
                const ml = Array.isArray((o as any)?.multi_lang) ? (o as any).multi_lang : null;
                const translated = Array.isArray(ml) ? ml.find((m: any) => String((m as any)?.language || "").toLowerCase() === "pt-br") : null;
                const oname = String((translated as any)?.value || o?.option_text || o?.name || o?.value || o?.label || oid || "");
                return { id: oid, name: oname };
              }) : [];
              const allowed_units = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
              const default_unit = String((a as any)?.default_unit || "");
              const itype = String(a?.input_type || a?.value_type || "").toLowerCase();
              const vtype = values.length > 0 ? "list" : (allowed_units.length > 0 ? "number_unit" : (itype.includes("number") ? "number" : "string"));
              const mandatory = !!(a?.is_mandatory || a?.mandatory);
              const allowVar = !!(a?.is_attribute_for_variation || a?.allow_variations || (Array.isArray(a?.tags) ? a.tags.includes("allow_variations") : false));
              const tags = { required: mandatory, allow_variations: allowVar };
              return { id: idStr, name: nameStr, values, value_type: vtype, tags, allowed_units, default_unit };
            });
            const brandRaw = Array.isArray((payload as any)?.data?.brand_list)
              ? (payload as any).data.brand_list
              : (Array.isArray((payload as any)?.response?.brand_list)
                ? (payload as any).response.brand_list
                : (Array.isArray((payload as any)?.brand_list) ? (payload as any).brand_list : []));
            const brandList = (Array.isArray(brandRaw) ? brandRaw : []).map((b: any, idx: number) => {
              const bidNum = typeof b?.brand_id === "number" ? b.brand_id : Number(b?.id || 0);
              const bid = Number.isFinite(bidNum) ? String(bidNum) : String(b?.brand_id || b?.id || idx);
              const bname = String(b?.original_brand_name || b?.display_brand_name || b?.brand_name || b?.name || bid);
              return { id: bid, name: bname };
            });
            setAttrsMeta(mapped);
            sessionCacheRef.current.attrsMetaByCategory[cat] = mapped;
            setShopeeBrandList(brandList);
            sessionCacheRef.current.brandListByCategory[cat] = brandList;
            setLastCategoryLoaded(cat);
          }
        } else {
          const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-attributes", {
            body: { organizationId, categoryId }
          });
          if (!error) {
            const arr = Array.isArray(data?.attributes) ? data.attributes : [];
            setAttrsMeta(arr);
            const cat = String(categoryId || "");
            sessionCacheRef.current.attrsMetaByCategory[cat] = arr;
            setLastCategoryLoaded(cat);
          }
        }
      } finally {
        setLoadingAttrs(false);
      }
    };
    fetchAttrs();
  }, [organizationId, categoryId, currentStep, fetchGate.s3, lastCategoryLoaded, isShopeeMode]);

  // Effect 3: fetchTechInput — fetches ML tech specs
  useEffect(() => {
    const fetchTechInput = async () => {
      if (!organizationId || !categoryId) return;
      if (currentStep !== 5) return;
      if (!fetchGate.s3) return;
      if (isShopeeMode) return;
      if (techSpecsInput && lastCategoryLoaded === String(categoryId || "")) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-technical-specs-input", {
          body: { organizationId, categoryId }
        });
        if (!error) setTechSpecsInput(data || null);
      } catch { }
    };
    fetchTechInput();
  }, [organizationId, categoryId, currentStep, fetchGate.s3, lastCategoryLoaded, isShopeeMode]);

  // Effect 4: fetchSaleTermsMeta — fetches ML sale terms
  useEffect(() => {
    const fetchSaleTermsMeta = async () => {
      if (!organizationId || !categoryId) return;
      if (currentStep !== 6) return;
      if (!fetchGate.s6) return;
      if (isShopeeMode) return;
      const cat = String(categoryId || "");
      const cached = sessionCacheRef.current.saleTermsMetaByCategory[cat];
      if (Array.isArray(cached)) { setSaleTermsMeta(cached); return; }
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-sale-terms", {
          body: { organizationId, categoryId }
        });
        if (!error) setSaleTermsMeta(Array.isArray((data as any)?.terms) ? (data as any).terms : []);
      } catch { }
    };
    fetchSaleTermsMeta();
  }, [organizationId, categoryId, currentStep, fetchGate.s6, isShopeeMode]);

  // Effect 5: evalConditional — evaluates conditional required attrs
  useEffect(() => {
    const evalConditional = async () => {
      if (!organizationId || !categoryId) return;
      if (!fetchGate.s3) return;
      if (!conditionalTrigger) return;
      if (isShopeeMode) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-attributes-conditional", {
          body: { organizationId, categoryId, attributes }
        });
        if (!error) setConditionalRequiredIds(Array.isArray((data as any)?.required_ids) ? (data as any).required_ids : []);
      } catch {
        setConditionalRequiredIds([]);
      }
    };
    evalConditional();
  }, [organizationId, categoryId, conditionalTrigger, debouncedAttrSig, fetchGate.s3, isShopeeMode]);

  // Effect 6: fetchListingTypes — fetches listing types
  useEffect(() => {
    const fetchListingTypes = async () => {
      if (!organizationId || !categoryId || !siteId) return;
      if (currentStep !== 6) return;
      if (!fetchGate.s6) return;
      if (isShopeeMode) return;
      const cat = String(categoryId || "");
      let arr = Array.isArray(sessionCacheRef.current.listingTypesByCategory[cat]) ? sessionCacheRef.current.listingTypesByCategory[cat] : [];
      if (!Array.isArray(arr) || arr.length === 0) {
        try {
          const { data, error } = await (supabase as any).functions.invoke("mercado-livre-available-listing-types", {
            body: { organizationId, categoryId }
          });
          arr = Array.isArray(data?.types) ? data.types : [];
          if (!error && arr.length === 0) {
            try {
              const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/listing_types`);
              const json = await res.json();
              if (Array.isArray(json)) arr = json;
            } catch { }
          }
        } catch { }
      }
      if (String(siteId).toUpperCase() === "MLB") {
        const pick = new Set(["gold_special", "gold_pro"]);
        arr = (arr || []).filter((t: any) => pick.has(String(t?.id || t))).map((t: any) => {
          const id = String(t?.id || t);
          const name = id === "gold_special" ? "Clássico" : (id === "gold_pro" ? "Premium" : String(t?.name || t?.listing_type_name || id));
          return { id, name };
        });
      }
      setListingTypes(arr);
    };
    fetchListingTypes();
  }, [organizationId, categoryId, siteId, currentStep, fetchGate.s6, isShopeeMode]);

  // Effect 7: auto-select first listing type
  useEffect(() => {
    if (currentStep < 6) return;
    if (!listingTypeId && Array.isArray(listingTypes) && listingTypes.length > 0) {
      const first = listingTypes[0];
      const id = String(first?.id || first);
      if (id) setListingTypeId(id);
    }
  }, [listingTypes, currentStep]);

  // Effect 8: fetchListingPrices — fetches listing prices
  useEffect(() => {
    const fetchListingPrices = async () => {
      const p = Number(debouncedPrice);
      if (!organizationId || !categoryId || !siteId || !p) return;
      if (currentStep !== 6) return;
      if (!fetchGate.s6) return;
      if (isShopeeMode) return;
      setLoadingListing(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
          body: { organizationId, siteId, price: p, categoryId }
        });
        if (!error) setListingPriceOptions(Array.isArray(data?.prices) ? data.prices : []);
      } finally {
        setLoadingListing(false);
      }
    };
    fetchListingPrices();
  }, [organizationId, siteId, categoryId, debouncedPrice, currentStep, fetchGate.s6, isShopeeMode]);

  // Effect 9: fetchShippingModes — fetches shipping modes + sets many state vars
  useEffect(() => {
    const fetchShippingModes = async () => {
      if (!organizationId || !siteId) return;
      if (currentStep < 6) return;
      if (isShopeeMode) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-shipping-methods", {
          body: { organizationId, siteId }
        });
        if (error) return;
        const methods = Array.isArray(data?.methods) ? data.methods : [];
        const prefs = data?.preferences && typeof data.preferences === "object" ? data.preferences : null;
        let modes: string[] = [];
        const modesRaw: any = prefs ? (prefs as any).modes : null;
        let modesArr: any[] | null = null;
        if (Array.isArray(modesRaw)) modesArr = modesRaw as any[];
        else if (typeof modesRaw === "string") { try { modesArr = JSON.parse(modesRaw); } catch { modesArr = null; } }
        if (Array.isArray(modesArr)) {
          modes = modesArr.map((m) => String(m));
        } else {
          const set = new Set<string>();
          methods.forEach((m: any) => {
            const arr = Array.isArray(m?.shipping_modes) ? m.shipping_modes : [];
            arr.forEach((x: any) => set.add(String(x)));
          });
          modes = Array.from(set);
        }
        const logisticsMap: Record<string, string[]> = {};
        const defaultsMap: Record<string, string> = {};
        const logisticsRaw: any = prefs ? (prefs as any).logistics : null;
        let logisticsArr: any[] | null = null;
        if (Array.isArray(logisticsRaw)) logisticsArr = logisticsRaw as any[];
        else if (typeof logisticsRaw === "string") { try { logisticsArr = JSON.parse(logisticsRaw); } catch { logisticsArr = null; } }
        if (Array.isArray(logisticsArr)) {
          logisticsArr.forEach((entry: any) => {
            const mode = String(entry?.mode || "");
            const types = Array.isArray(entry?.types) ? entry.types.map((t: any) => String(t?.type || t)) : [];
            logisticsMap[mode] = types;
            const def = Array.isArray(entry?.types) ? entry.types.find((t: any) => t?.default === true) : null;
            if (def && def.type) defaultsMap[mode] = String(def.type);
          });
        }
        // Determinar modo preferido a partir de mandatorySettings antes de calcular os tipos
        const mandatoryRaw: any = prefs ? (prefs as any).mandatorySettings : null;
        let mandatoryObj: any = null;
        if (mandatoryRaw && typeof mandatoryRaw === "object") mandatoryObj = mandatoryRaw;
        else if (typeof mandatoryRaw === "string") { try { mandatoryObj = JSON.parse(mandatoryRaw); } catch { mandatoryObj = null; } }
        const preferredMode = mandatoryObj?.mode ? String(mandatoryObj.mode) : (modes.includes("me2") ? "me2" : (modes.includes("me1") ? "me1" : (modes[0] || "")));
        let freeMandatory = false;
        const scanMandatory = (obj: any) => {
          if (!obj || typeof obj !== "object") return;
          for (const [k, v] of Object.entries(obj)) {
            const key = String(k).toLowerCase();
            if (key.includes("free") && key.includes("ship")) {
              if (typeof v === "boolean" && v === true) freeMandatory = true;
              if (typeof v === "string") {
                const s = v.toLowerCase();
                if (s.includes("mandatory") || s.includes("obrig") || s === "true" || s === "enabled" || s === "active") freeMandatory = true;
              }
            }
            if (v && typeof v === "object") scanMandatory(v as any);
          }
        };
        scanMandatory(mandatoryObj);
        const priceVal = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
        const isPriceMandatoryMLB = String(siteId).toUpperCase() === "MLB" && priceVal >= 79 && preferredMode === "me2";
        const cfgMandatory = freeMandatory && preferredMode === "me2";
        setFreeShipMandatoryCfg(cfgMandatory);
        setFreeShippingMandatory(cfgMandatory || isPriceMandatoryMLB);

        setShippingModesAvailable(modes);
        setShippingLogisticsByMode(logisticsMap);
        setShippingLogisticsDefaults(defaultsMap);

        const modeForTypes = preferredMode || "me2";
        const knownTypes = ["drop_off", "xd_drop_off", "self_service"];
        const typesForMode = (logisticsMap[modeForTypes] || []).filter((t: string) => t !== "fulfillment");
        try {
          const { data: capsRow } = await (supabase as any)
            .from("marketplace_integrations")
            .select("marketplace_name")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .order("expires_in", { ascending: false })
            .limit(1)
            .single();
          const allowedSet = new Set<string>();
          const baseFiltered = typesForMode.length > 0 ? typesForMode : knownTypes;
          const toShow = allowedSet.size > 0 ? baseFiltered.filter((t) => allowedSet.has(String(t))) : baseFiltered;
          setAvailableLogisticTypes(toShow);
          const defType = String((defaultsMap as any)[modeForTypes] || "");
          const nonFlex = toShow.filter((t) => String(t || "") !== "self_service");
          const primaryPick = nonFlex.includes(defType) ? defType : (nonFlex[0] || "");
          const hasFlex = toShow.includes("self_service");
          if (!selectedLogisticType && primaryPick) setSelectedLogisticType(primaryPick);
        } catch { }
        if (!shipping?.mode || !modes.includes(String((shipping as any)?.mode || ""))) {
          const next = { ...(shipping || {}), mode: preferredMode } as any;
          try {
            const fcRaw: any = prefs ? (prefs as any).freeConfigurations : null;
            let fcArr: any[] | null = null;
            if (Array.isArray(fcRaw)) fcArr = fcRaw as any[];
            else if (typeof fcRaw === "string") { try { fcArr = JSON.parse(fcRaw); } catch { fcArr = null; } }
            if (preferredMode === "me2" && Array.isArray(fcArr)) {
              const def = fcArr.find((r: any) => r?.rule?.default === true);
              if (def && def.rule && def.rule.free_shipping_flag === true) next.free_shipping = true;
            }
          } catch { }
          const modeNow = preferredMode;
          const priceValNow = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
          const priceRule = String(siteId).toUpperCase() === "MLB" && priceValNow >= 79 && modeNow === "me2";
          const cfgRule = freeShipMandatoryCfg && modeNow === "me2";
          if (cfgRule || priceRule) next.free_shipping = true;
          if (preferredMode) setShipping(next);
        }
      } catch { }
    };
    fetchShippingModes();
  }, [organizationId, siteId, currentStep]);

  // Effect 10: free shipping mandatory enforcement
  useEffect(() => {
    if (!freeShippingMandatory) return;
    if (!(shipping as any)?.free_shipping) setShipping({ ...(shipping || {}), free_shipping: true });
  }, [freeShippingMandatory]);

  // Effect 11: price → free shipping recalculation
  useEffect(() => {
    const mode = String((shipping as any)?.mode || '').toLowerCase();
    const priceVal = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
    const isPriceMandatoryMLB = String(siteId).toUpperCase() === 'MLB' && priceVal >= 79 && mode === 'me2';
    const mandatoryNow = !!(freeShipMandatoryCfg || isPriceMandatoryMLB);
    setFreeShippingMandatory(mandatoryNow);
    if (!mandatoryNow && (shipping as any)?.free_shipping) {
      setShipping({ ...(shipping || {}), free_shipping: false });
    }
  }, [price, siteId, shipping, freeShipMandatoryCfg]);

  const prefetchForNextStep = useCallback(
    async (step: number) => {
      if (step === 1) {
        if (!fetchGate.s1 && organizationId) {
          try {
            const { data, error } = await (supabase as any)
              .from("marketplace_integrations")
              .select("marketplace_name")
              .eq("organizations_id", organizationId);
            if (!error) {
              const names: string[] = (data || []).map((r: any) => String(r?.marketplace_name || "")).map((n) => (n === "mercado_livre" ? "Mercado Livre" : n));
              const clean = Array.from(new Set(names)).filter(Boolean);
              setConnectedApps(clean);
            }
          } catch {}
          setFetchGate((g) => ({ ...g, s1: true }));
        }
        if (!organizationId || !categoryId) return;
        const cat = String(categoryId || "");
        const cachedAttrs = sessionCacheRef.current.attrsMetaByCategory[cat];
        const cachedTech = sessionCacheRef.current.techInputByCategory[cat];
        if (Array.isArray(cachedAttrs)) setAttrsMeta(cachedAttrs);
        else if (!isShopeeMode) {
          try {
            const [attrsRes, techRes] = await Promise.all([
              (supabase as any).functions.invoke("mercado-livre-categories-attributes", { body: { organizationId, categoryId } }),
              (supabase as any).functions.invoke("mercado-livre-technical-specs-input", { body: { organizationId, categoryId } }),
            ]);
            if (!attrsRes.error) {
              const arr = Array.isArray(attrsRes.data?.attributes) ? attrsRes.data.attributes : [];
              setAttrsMeta(arr);
              sessionCacheRef.current.attrsMetaByCategory[cat] = arr;
              setLastCategoryLoaded(cat);
            }
            if (!techRes.error) {
              const inpt = techRes.data || null;
              setTechSpecsInput(inpt);
              sessionCacheRef.current.techInputByCategory[cat] = inpt;
            }
          } catch {}
        }
        setFetchGate((g) => ({ ...g, s3: true }));
      }
      if (step === 5) {
        if (isShopeeMode) {
          setSaleTermsMeta([]);
          setListingTypes([]);
          setFetchGate((g) => ({ ...g, s6: true }));
          return;
        }
        if (!organizationId || !categoryId) return;
        try {
          const cat = String(categoryId || "");
          const cachedTerms = sessionCacheRef.current.saleTermsMetaByCategory[cat];
          const cachedTypes = sessionCacheRef.current.listingTypesByCategory[cat];
          let arr = Array.isArray(cachedTypes) ? cachedTypes : [];
          if (!Array.isArray(cachedTerms) || !Array.isArray(cachedTypes)) {
            const [termsRes, typesRes] = await Promise.all([
              (supabase as any).functions.invoke("mercado-livre-categories-sale-terms", { body: { organizationId, categoryId } }),
              (supabase as any).functions.invoke("mercado-livre-available-listing-types", { body: { organizationId, categoryId } }),
            ]);
            if (!termsRes.error) {
              const terms = Array.isArray((termsRes.data as any)?.terms) ? (termsRes.data as any).terms : [];
              setSaleTermsMeta(terms);
              sessionCacheRef.current.saleTermsMetaByCategory[cat] = terms;
            }
            arr = Array.isArray(typesRes.data?.types) ? typesRes.data.types : [];
          }
          if (String(siteId).toUpperCase() === "MLB") {
            const pick = new Set(["gold_special", "gold_pro"]);
            arr = (arr || []).filter((t: any) => pick.has(String(t?.id || t))).map((t: any) => {
              const id = String(t?.id || t);
              const name = id === "gold_special" ? "Clássico" : (id === "gold_pro" ? "Premium" : String(t?.name || t?.listing_type_name || id));
              return { id, name };
            });
          }
          setListingTypes(arr);
          sessionCacheRef.current.listingTypesByCategory[cat] = arr;
          setFetchGate((g) => ({ ...g, s6: true }));
        } catch {}
      }
      if (step === 6) {
        const p = Number(debouncedPrice);
        if (p > 0 && organizationId && categoryId && siteId && !isShopeeMode) {
          try {
            const key = `${String(siteId)}:${String(categoryId)}:${p}`;
            const cached = sessionCacheRef.current.listingPriceOptionsByKey[key];
            if (Array.isArray(cached)) {
              setListingPriceOptions(cached);
            } else {
              const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
                body: { organizationId, siteId, price: p, categoryId },
              });
              if (!error) {
                const arr = Array.isArray(data?.prices) ? data.prices : [];
                setListingPriceOptions(arr);
                sessionCacheRef.current.listingPriceOptionsByKey[key] = arr;
              }
            }
          } catch {}
        }
        setFetchGate((g) => ({ ...g, s7: true }));
      }
    },
    [
      organizationId,
      categoryId,
      siteId,
      isShopeeMode,
      fetchGate.s1,
      debouncedPrice,
      sessionCacheRef,
      setAttrsMeta,
      setTechSpecsInput,
      setLastCategoryLoaded,
      setSaleTermsMeta,
      setListingTypes,
      setListingPriceOptions,
      setFetchGate,
    ]
  );

  useEffect(() => {
    if (currentStep < 7) return;
    if (String((shipping as any)?.mode || "").toLowerCase() !== "me2") return;
    try {
      const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || "") === String(listingTypeId || "")) || {};
      let mandatory = false;
      const scan = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          const key = String(k).toLowerCase();
          if (key.includes("free") && key.includes("ship")) {
            if (typeof v === "boolean" && v === true) mandatory = true;
            if (typeof v === "string") {
              const s = (v as string).toLowerCase();
              if (s.includes("mandatory") || s.includes("obrig") || s === "true" || s === "enabled" || s === "active") mandatory = true;
            }
          }
          if (v && typeof v === "object") scan(v as any);
        }
      };
      scan(opt);
      if (mandatory && !(shipping as any)?.free_shipping) setShipping({ ...(shipping || {}), free_shipping: true });
    } catch {}
  }, [listingPriceOptions, listingTypeId, shipping, currentStep, setShipping]);

  return {
    attrsMeta,
    setAttrsMeta,
    loadingAttrs,
    techSpecsInput,
    setTechSpecsInput,
    techSpecsOutput,
    setTechSpecsOutput,
    saleTermsMeta,
    setSaleTermsMeta,
    listingTypes,
    setListingTypes,
    loadingListing,
    listingPriceOptions,
    setListingPriceOptions,
    shippingModesAvailable,
    availableLogisticTypes,
    selectedLogisticType,
    setSelectedLogisticType,
    freeShipMandatoryCfg,
    freeShippingMandatory,
    setFreeShippingMandatory,
    connectedApps,
    setConnectedApps,
    shopeeBrandList,
    conditionalRequiredIds,
    lastCategoryLoaded,
    setLastCategoryLoaded,
    prefetchForNextStep,
    triggerConditionalEval,
  };
}
