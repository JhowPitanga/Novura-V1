import { useState } from "react";
import { toast } from "sonner";
import {
  applyCopiarCSOSN,
  migrateIcmsKey,
  type DentroFora,
  type IcmsConfig,
  type IcmsExtra,
  type Pessoa,
} from "@/components/settings/taxes/tax-payload";

export function useIcmsState(
  initialIcms: Record<string, IcmsConfig> = {},
  initialSaidaExtras: IcmsExtra[] = [],
  initialEntradaExtras: IcmsExtra[] = []
) {
  const [icms, setIcms] = useState<Record<string, IcmsConfig>>(initialIcms);
  const [icmsDefaultCardSelection, setIcmsDefaultCardSelection] = useState<
    Record<string, { pessoa: Pessoa; abrang: DentroFora }>
  >({});

  const [icmsSaidaExtras, setIcmsSaidaExtras] = useState<IcmsExtra[]>(() => {
    const pf = (initialSaidaExtras || [])
      .filter((e) => (e.pessoa || "PF") === "PF")
      .map((e) => ({ ...e, pessoa: "PF" as const }));
    const pj = (initialSaidaExtras || [])
      .filter((e) => e.pessoa === "PJ")
      .map((e) => ({ ...e, pessoa: "PJ" as const }));
    return [...pf, ...pj];
  });
  const [icmsEntradaExtras, setIcmsEntradaExtras] = useState<IcmsExtra[]>(
    initialEntradaExtras
  );

  const setIcmsField = (
    tipo: "saida" | "entrada",
    pessoa: Pessoa,
    abrang: DentroFora,
    field: keyof IcmsConfig,
    value: string | boolean
  ) => {
    const key = `${tipo}_${pessoa}_${abrang}`;
    setIcms((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const updateDefaultCardSelection = (
    baseKey: string,
    tipo: "saida" | "entrada",
    next: Partial<{ pessoa: Pessoa; abrang: DentroFora }>
  ) => {
    setIcmsDefaultCardSelection((prevSel) => {
      const parts = baseKey.split("_") as ["saida" | "entrada", Pessoa, DentroFora];
      const current = prevSel[baseKey] || { pessoa: parts[1], abrang: parts[2] };
      const newSel = {
        pessoa: (next.pessoa ?? current.pessoa) as Pessoa,
        abrang: (next.abrang ?? current.abrang) as DentroFora,
      };

      setIcms((prevIcms) =>
        migrateIcmsKey(
          prevIcms,
          tipo,
          current.pessoa,
          current.abrang,
          newSel.pessoa,
          newSel.abrang
        )
      );

      return { ...prevSel, [baseKey]: newSel };
    });
  };

  const copiarCSOSNParaTodos = (fromKey: string) => {
    setIcms((prev) => applyCopiarCSOSN(prev, fromKey));
    toast.success("CSOSN copiado para todos os cenários");
  };

  const addIcmsExtra = (where: "saida" | "entrada") => {
    const empty: IcmsExtra = { pessoa: "PF", abrangencia: "dentro", cfop: "", csosn: "" };
    if (where === "saida") setIcmsSaidaExtras((prev) => [...prev, empty]);
    if (where === "entrada") setIcmsEntradaExtras((prev) => [...prev, { ...empty }]);
  };

  const setIcmsExtraField = (
    where: "saida" | "entrada",
    index: number,
    field: keyof IcmsExtra,
    value: string | Pessoa | DentroFora
  ) => {
    if (where === "saida") {
      setIcmsSaidaExtras((prev) =>
        prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
      );
    }
    if (where === "entrada") {
      setIcmsEntradaExtras((prev) =>
        prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
      );
    }
  };

  const removeIcmsExtra = (where: "saida" | "entrada", index: number) => {
    if (where === "saida") setIcmsSaidaExtras((prev) => prev.filter((_, i) => i !== index));
    if (where === "entrada") setIcmsEntradaExtras((prev) => prev.filter((_, i) => i !== index));
  };

  const resetIcms = (
    nextIcms: Record<string, IcmsConfig>,
    nextSaidaExtras: IcmsExtra[],
    nextEntradaExtras: IcmsExtra[]
  ) => {
    setIcms(nextIcms);
    setIcmsDefaultCardSelection({});
    const pf = (nextSaidaExtras || [])
      .filter((e) => (e.pessoa || "PF") === "PF")
      .map((e) => ({ ...e, pessoa: "PF" as const }));
    const pj = (nextSaidaExtras || [])
      .filter((e) => e.pessoa === "PJ")
      .map((e) => ({ ...e, pessoa: "PJ" as const }));
    setIcmsSaidaExtras([...pf, ...pj]);
    setIcmsEntradaExtras(nextEntradaExtras);
  };

  return {
    icms,
    icmsSaidaExtras,
    icmsEntradaExtras,
    icmsDefaultCardSelection,
    setIcmsField,
    updateDefaultCardSelection,
    copiarCSOSNParaTodos,
    addIcmsExtra,
    setIcmsExtraField,
    removeIcmsExtra,
    resetIcms,
  };
}
