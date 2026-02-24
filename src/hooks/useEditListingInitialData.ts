import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VariationLite } from "@/components/listings/editListing.types";

export interface UseEditListingInitialDataParams {
  organizationId: string | undefined;
  itemId: string | undefined;
  onError: (message: string) => void;
}

/**
 * Loads ML listing item from Supabase (unified then fallback table) and exposes
 * form state. Single source for initial fetch; callers keep ownership of setters
 * for subsequent edits.
 */
export function useEditListingInitialData({
  organizationId,
  itemId,
  onError,
}: UseEditListingInitialDataParams) {
  const [loading, setLoading] = useState(false);
  const [itemRow, setItemRow] = useState<any>(null);
  const [soldQty, setSoldQty] = useState(0);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [variations, setVariations] = useState<VariationLite[]>([]);
  const [pictures, setPictures] = useState<(string | File)[]>([]);
  const [shipping, setShipping] = useState<any>({});
  const [status, setStatus] = useState("");
  const [attributes, setAttributes] = useState<any[]>([]);
  const [description, setDescription] = useState("");
  const [videoId, setVideoId] = useState("");

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const run = async () => {
      if (!organizationId || !itemId) return;
      setLoading(true);
      try {
        let mi: any = null;
        try {
          const { data, error } = await (supabase as any)
            .from("marketplace_items_unified")
            .select("*")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .eq("marketplace_item_id", String(itemId))
            .single();
          if (!error) mi = data;
        } catch {}

        if (!mi) {
          const { data, error } = await (supabase as any)
            .from("marketplace_items")
            .select("*")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .eq("marketplace_item_id", String(itemId))
            .single();
          if (error) throw error;
          mi = data;
        }

        setItemRow(mi);
        setSoldQty(typeof mi?.sold_quantity === "number" ? mi.sold_quantity : 0);
        setTitle(String(mi?.title || ""));
        setPrice(String(typeof mi?.price === "number" ? mi.price : Number(mi?.price) || 0));

        const rawVars: any[] = Array.isArray(mi?.variations) ? mi.variations : [];
        const picsArr: any[] = Array.isArray(mi?.pictures) ? mi.pictures : [];
        const mapped: VariationLite[] = rawVars.map((v: any) => {
          const pictureIds: string[] = Array.isArray(v?.picture_ids) ? v.picture_ids : v?.picture_id ? [v.picture_id] : [];
          const resolvedUrls: string[] = pictureIds
            .map((pid) => {
              const match = picsArr.find((p: any) => String(p?.id || p?.picture_id) === String(pid));
              if (typeof match === "string") return match;
              return match?.url || match?.secure_url || "";
            })
            .filter((u: string) => !!u);
          return {
            id: v?.id ?? String(v?.attribute_combinations?.map((a: any) => a?.value_id || a?.value_name).join("-")),
            sku: v?.seller_sku || null,
            available_quantity: typeof v?.available_quantity === "number" ? v.available_quantity : 0,
            image: resolvedUrls[0] || null,
            attribute_combinations: Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [],
            price: typeof v?.price === "number" ? v.price : Number(mi?.price) || 0,
            pictureFiles: resolvedUrls,
          };
        });
        setVariations(mapped);

        const urls = picsArr.map((p: any) => (typeof p === "string" ? p : p?.url || p?.secure_url || "")).filter((u: string) => !!u);
        setPictures(urls);

        try {
          setVideoId(String(mi?.data?.video_id || ""));
        } catch {}

        setShipping((prev: any) => ({
          ...(mi?.shipping || prev || {}),
          free_shipping:
            typeof (mi as any)?.free_shipping === "boolean"
              ? (mi as any).free_shipping
              : String((mi as any)?.free_shipping || "").toLowerCase() === "true",
          dimensions: {
            height: (mi as any)?.package_height_cm ?? prev?.dimensions?.height ?? "",
            width: (mi as any)?.package_width_cm ?? prev?.dimensions?.width ?? "",
            length: (mi as any)?.package_length_cm ?? prev?.dimensions?.length ?? "",
            weight: (mi as any)?.package_weight_g ?? prev?.dimensions?.weight ?? "",
          },
        }));
        setStatus(String(mi?.status || ""));

        try {
          const arr = Array.isArray(mi?.attributes) ? mi.attributes : [];
          setAttributes(arr);
        } catch {}

        try {
          const plain = (mi as any)?.description_plain_text ?? "";
          setDescription(String(plain || ""));
        } catch {}
      } catch (e) {
        onErrorRef.current(String((e as any)?.message || e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [organizationId, itemId]);

  return {
    loading,
    itemRow,
    setItemRow,
    soldQty,
    setSoldQty,
    title,
    setTitle,
    price,
    setPrice,
    variations,
    setVariations,
    pictures,
    setPictures,
    shipping,
    setShipping,
    status,
    setStatus,
    attributes,
    setAttributes,
    description,
    setDescription,
    videoId,
    setVideoId,
  };
}
