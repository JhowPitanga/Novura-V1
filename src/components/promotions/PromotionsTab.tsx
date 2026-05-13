import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PromotionTypeCard } from "./PromotionTypeCard";
import { PromotionsList } from "./PromotionsList";
import { PromotionDetailDrawer } from "./PromotionDetailDrawer";
import { AddItemsToPromotionDialog } from "./AddItemsToPromotionDialog";
import {
  usePromotionsByMarketplace,
  useSyncPromotions,
  useDeletePromotion,
} from "@/hooks/usePromotions";
import type { Promotion } from "@/types/promotions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { normalizeMarketplaceKey } from "@/utils/marketplaceUtils";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getSegmentsForMarketplace,
  countCandidatesInSegment,
  promotionMatchesSegment,
  type PromotionSegmentId,
} from "./promotionSegments";

interface PromotionsTabProps {
  organizationId: string;
  marketplaceDisplayName: string;
}

async function fetchIntegrationId(orgId: string, marketplaceName: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("marketplace_integrations")
    .select("id")
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName)
    .is("deactivated_at", null)
    .limit(1)
    .single();
  return data?.id ?? null;
}

function matchesPromotionSearch(p: Promotion, q: string): boolean {
  if (!q) return true;
  const name = p.name?.toLowerCase() ?? "";
  const ext = p.external_id?.toLowerCase() ?? "";
  return name.includes(q) || ext.includes(q);
}

export function PromotionsTab({ organizationId, marketplaceDisplayName }: PromotionsTabProps) {
  const navigate = useNavigate();
  const isMercadoLivre = marketplaceDisplayName.toLowerCase() !== "shopee";
  const marketplaceKey = normalizeMarketplaceKey(marketplaceDisplayName);
  const { canCreatePromotion, canEditPromotion, canDeletePromotion } = usePermissions();

  const segments = useMemo(() => getSegmentsForMarketplace(isMercadoLivre), [isMercadoLivre]);

  const { data: integrationId } = useQuery({
    queryKey: ["integration-id", organizationId, marketplaceDisplayName],
    queryFn: () => fetchIntegrationId(organizationId, marketplaceDisplayName),
    enabled: !!organizationId && !!marketplaceDisplayName,
    staleTime: 10 * 60 * 1000,
  });

  const { data: promotions = [], isLoading } = usePromotionsByMarketplace(organizationId, marketplaceKey);
  const syncMutation = useSyncPromotions(organizationId, marketplaceKey);
  const deleteMutation = useDeletePromotion(organizationId, marketplaceKey);

  const [selectedSegment, setSelectedSegment] = useState<PromotionSegmentId | null>(null);
  const [search, setSearch] = useState("");

  const [detailPromotion, setDetailPromotion] = useState<Promotion | null>(null);
  const [addItemsPromotion, setAddItemsPromotion] = useState<Promotion | null>(null);
  const [deletePromotion, setDeletePromotionState] = useState<Promotion | null>(null);

  const searchQ = search.trim().toLowerCase();

  const filteredAllCampaigns = useMemo(
    () => promotions.filter(p => matchesPromotionSearch(p, searchQ)),
    [promotions, searchQ],
  );

  const filteredCampaignsInSegment = useMemo(() => {
    if (!selectedSegment) return [];
    return promotions
      .filter(p => promotionMatchesSegment(p, selectedSegment, segments))
      .filter(p => matchesPromotionSearch(p, searchQ));
  }, [promotions, segments, selectedSegment, searchQ]);

  const listPromotions = selectedSegment ? filteredCampaignsInSegment : filteredAllCampaigns;

  const segmentLabel = useMemo(() => {
    if (!selectedSegment) return "";
    return segments.find(s => s.id === selectedSegment)?.label ?? selectedSegment;
  }, [segments, selectedSegment]);

  const handleSync = useCallback(() => {
    if (!integrationId) return;
    syncMutation.mutate(integrationId);
  }, [integrationId, syncMutation]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletePromotion || !integrationId) return;
    deleteMutation.mutate({
      integrationId,
      externalId: deletePromotion.external_id,
      promotionType: deletePromotion.promotion_type,
    });
    setDeletePromotionState(null);
  }, [deletePromotion, integrationId, deleteMutation]);

  const handleSegmentClick = (id: PromotionSegmentId) => {
    setSelectedSegment(prev => (prev === id ? null : id));
  };

  if (!organizationId) return null;

  const canCreate = canCreatePromotion();
  const createDisabledReason = !integrationId
    ? "Conecte e selecione um marketplace ativo para criar promoções."
    : !canCreate
      ? "Sem permissão para criar promoções. Peça ao administrador a permissão \"Criar promoção\" (promote_create) em Anúncios."
      : null;

  const goCreateDiscount = () => {
    navigate(`/anuncios/promocoes/nova?marketplace=${encodeURIComponent(marketplaceDisplayName)}`);
  };
  const goCreateFlash = () => {
    navigate("/anuncios/promocoes/shopee/flash/nova");
  };

  const CreatePromoButton = ({ onClick }: { onClick: () => void }) => {
    const disabled = !integrationId || !canCreate;
    const btn = (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-medium"
        disabled={disabled}
        onClick={onClick}
      >
        Criar
      </Button>
    );
    if (!createDisabledReason) return btn;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{btn}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-left">
          {createDisabledReason}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar campanha ou ID…"
              className="pl-9 h-10 bg-white"
            />
          </div>
          <Button
            type="button"
            onClick={handleSync}
            disabled={!integrationId || syncMutation.isPending}
            className="shrink-0 h-10 px-5 bg-violet-600 hover:bg-violet-700 text-white shadow-sm whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 mr-2 inline ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>

        {isMercadoLivre ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {segments.map(seg => {
              const count = promotions.filter(p => seg.matches(p)).length;
              const candidateCount = countCandidatesInSegment(promotions, seg);
              const showCreateSeller = seg.id === "seller";

              return (
                <PromotionTypeCard
                  key={seg.id}
                  eyebrow={seg.eyebrow}
                  label={seg.label}
                  icon={seg.icon}
                  count={count}
                  candidateCount={candidateCount}
                  selected={selectedSegment === seg.id}
                  onClick={() => handleSegmentClick(seg.id)}
                  headerAction={showCreateSeller ? <CreatePromoButton onClick={goCreateDiscount} /> : undefined}
                />
              );
            })}
            {Array.from({ length: Math.max(0, 8 - segments.length) }).map((_, i) => (
              <div
                key={`ml-promo-card-placeholder-${i}`}
                className="min-h-[7.5rem] rounded-xl border border-dashed border-gray-200 bg-gray-50/50"
                aria-hidden
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl">
            {segments.map(seg => {
              const count = promotions.filter(p => seg.matches(p)).length;
              const candidateCount = countCandidatesInSegment(promotions, seg);
              const showCreateShopeeDisc = seg.id === "shopee_discount";
              const showCreateShopeeFlash = seg.id === "shopee_flash";

              return (
                <PromotionTypeCard
                  key={seg.id}
                  eyebrow={seg.eyebrow}
                  label={seg.label}
                  icon={seg.icon}
                  count={count}
                  candidateCount={candidateCount}
                  selected={selectedSegment === seg.id}
                  onClick={() => handleSegmentClick(seg.id)}
                  headerAction={
                    showCreateShopeeDisc ? (
                      <CreatePromoButton onClick={goCreateDiscount} />
                    ) : showCreateShopeeFlash ? (
                      <CreatePromoButton onClick={goCreateFlash} />
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-14">
            <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800">
              {selectedSegment ? `Campanhas: ${segmentLabel}` : "Todas as campanhas"}
            </h3>
            {selectedSegment && listPromotions.length === 0 ? (
              <Alert>
                <AlertTitle>Nenhuma campanha nesta categoria</AlertTitle>
                <AlertDescription className="text-sm">
                  Ainda não há promoções sincronizadas para &ldquo;{segmentLabel}&rdquo;. Use <strong>Sincronizar</strong> ou crie uma campanha compatível no
                  marketplace.
                </AlertDescription>
              </Alert>
            ) : (
              <PromotionsList
                promotions={listPromotions}
                onView={setDetailPromotion}
                onEdit={setDetailPromotion}
                onAddItems={setAddItemsPromotion}
                onDelete={setDeletePromotionState}
                canEdit={canEditPromotion()}
                canDelete={canDeletePromotion()}
              />
            )}
          </div>
        )}

        <PromotionDetailDrawer
          promotion={detailPromotion}
          integrationId={integrationId ?? ""}
          organizationId={organizationId}
          marketplaceKey={marketplaceKey}
          onClose={() => setDetailPromotion(null)}
          onAddItems={p => {
            setDetailPromotion(null);
            setAddItemsPromotion(p);
          }}
        />

        <AddItemsToPromotionDialog
          promotion={addItemsPromotion}
          integrationId={integrationId ?? ""}
          organizationId={organizationId}
          marketplaceKey={marketplaceKey}
          onClose={() => setAddItemsPromotion(null)}
        />

        <AlertDialog open={!!deletePromotion} onOpenChange={open => !open && setDeletePromotionState(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Encerrar promoção?</AlertDialogTitle>
              <AlertDialogDescription>
                A promoção &ldquo;{deletePromotion?.name}&rdquo; será encerrada no marketplace e não poderá ser reativada.
                Tem certeza?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Encerrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
