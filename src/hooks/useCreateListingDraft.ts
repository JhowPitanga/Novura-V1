import { MutableRefObject, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { loadDraft, saveDraftToDB, serializeImages } from "@/services/create-listing.service";
import type { DraftData, SessionCache } from "@/types/create-listing";

export interface DraftFormSnapshot {
  organizationId: string | null | undefined;
  isShopeeMode: boolean;
  siteId: string;
  title: string;
  categoryId: string;
  attributes: any[];
  variations: any[];
  pictures: string[];
  price: string;
  listingTypeId: string;
  shipping: any;
  saleTerms: any[];
  description: string;
  availableQuantity: number;
  currentStep: number;
  lastCategoryLoaded: string;
  attrsMeta: any[];
  techSpecsInput: any;
  saleTermsMeta: any[];
  listingTypes: any[];
  listingPriceOptions: any[];
  sessionCacheRef: MutableRefObject<SessionCache>;
}

interface UseCreateListingDraftParams {
  organizationId: string | null | undefined;
  draftId: string | null;
  hasUnsavedData: boolean;
  publishing: boolean;
  navigate: (path: string) => void;
  onDraftLoaded: (draft: DraftData) => void;
}

interface UseCreateListingDraftResult {
  currentDraftId: string | null;
  setCurrentDraftId: (id: string | null) => void;
  confirmExit: boolean;
  setConfirmExit: (v: boolean) => void;
  allowNavRef: MutableRefObject<boolean>;
  saveDraftAndExit: (snapshot: DraftFormSnapshot) => Promise<void>;
}

export function useCreateListingDraft({
  organizationId,
  draftId,
  hasUnsavedData,
  publishing,
  navigate,
  onDraftLoaded,
}: UseCreateListingDraftParams): UseCreateListingDraftResult {
  const { toast } = useToast();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const [confirmExit, setConfirmExit] = useState(false);
  const lastSavedSigRef = useRef<string>("");
  const saveDraftTimerRef = useRef<any>(null);
  const allowNavRef = useRef<boolean>(false);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedData && !publishing) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedData, publishing]);

  // click guard on internal anchor links
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      if (!hasUnsavedData || publishing) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || anchor.href || "";
      if (!href) return;
      const url = href.startsWith("http") ? new URL(href) : new URL(href, window.location.origin);
      if (url.origin === window.location.origin) { e.preventDefault(); setConfirmExit(true); }
    };
    document.addEventListener("click", clickHandler, true);
    return () => document.removeEventListener("click", clickHandler, true);
  }, [hasUnsavedData, publishing]);

  // history.pushState / replaceState guard
  useEffect(() => {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    (history as any).pushState = function (...args: any[]) {
      if (hasUnsavedData && !allowNavRef.current && !publishing) { setConfirmExit(true); return; }
      return origPush.apply(this, args as any);
    };
    (history as any).replaceState = function (...args: any[]) {
      if (hasUnsavedData && !allowNavRef.current && !publishing) { setConfirmExit(true); return; }
      return origReplace.apply(this, args as any);
    };
    return () => {
      (history as any).pushState = origPush;
      (history as any).replaceState = origReplace;
    };
  }, [hasUnsavedData, publishing]);

  // Load draft from URL param
  useEffect(() => {
    if (!draftId || !organizationId) return;
    const run = async () => {
      try {
        const draft = await loadDraft(draftId, String(organizationId));
        if (draft) onDraftLoaded(draft);
      } catch { }
    };
    run();
  }, [draftId, organizationId]);

  const saveDraftAndExit = async (snapshot: DraftFormSnapshot) => {
    try {
      const normalizedVariations = await Promise.all(
        (snapshot.variations || []).map(async (v: any) => {
          const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
          const imgs = await serializeImages(files, snapshot.organizationId, currentDraftId);
          return { ...v, pictureFiles: imgs };
        })
      );

      const draft: DraftData = {
        organizations_id: String(snapshot.organizationId || ""),
        marketplace_name: snapshot.isShopeeMode ? "Shopee" : "Mercado Livre",
        site_id: snapshot.siteId,
        title: snapshot.title,
        category_id: snapshot.categoryId,
        attributes: snapshot.attributes,
        variations: normalizedVariations,
        pictures: snapshot.pictures,
        price: Number(snapshot.price || 0),
        listing_type_id: snapshot.listingTypeId,
        shipping: snapshot.shipping,
        sale_terms: snapshot.saleTerms,
        description: snapshot.description,
        available_quantity: snapshot.availableQuantity,
        last_step: snapshot.currentStep,
        status: "draft",
        api_cache: {
          attrsMeta: snapshot.lastCategoryLoaded === String(snapshot.categoryId || "") ? snapshot.attrsMeta : undefined,
          techSpecsInput: snapshot.techSpecsInput,
          saleTermsMeta: snapshot.saleTermsMeta,
          listingTypes: snapshot.listingTypes,
          listingPriceOptions:
            snapshot.sessionCacheRef.current.listingPriceOptionsByKey[
              `${snapshot.siteId}:${snapshot.categoryId}:${Number(snapshot.price || 0)}`
            ] || snapshot.listingPriceOptions,
        },
      };

      const sig = JSON.stringify(draft);
      if (lastSavedSigRef.current && lastSavedSigRef.current === sig) {
        setConfirmExit(false);
        allowNavRef.current = true;
        navigate("/anuncios/rascunhos");
        setTimeout(() => { allowNavRef.current = false; }, 300);
        return;
      }

      if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
      saveDraftTimerRef.current = setTimeout(async () => {
        try {
          const newId = await saveDraftToDB(draft, currentDraftId, String(snapshot.organizationId || ""));
          if (newId && !currentDraftId) setCurrentDraftId(newId);
          lastSavedSigRef.current = sig;
          setConfirmExit(false);
          allowNavRef.current = true;
          navigate("/anuncios/rascunhos");
          setTimeout(() => { allowNavRef.current = false; }, 300);
        } catch (err: any) {
          toast({ title: "Falha ao salvar rascunho", description: err?.message || String(err), variant: "destructive" });
        }
      }, 300);
    } catch (e: any) {
      toast({ title: "Falha ao salvar rascunho", description: e?.message || String(e), variant: "destructive" });
    }
  };

  return { currentDraftId, setCurrentDraftId, confirmExit, setConfirmExit, allowNavRef, saveDraftAndExit };
}
