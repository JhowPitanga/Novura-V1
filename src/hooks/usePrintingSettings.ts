import { useState } from "react";

export const usePrintingSettings = () => {
    const [printSettings, setPrintSettings] = useState({
        labelPrinter: "zebra",
        labelSize: "10x15",
        separateLabelPerItem: false,
        groupByProduct: true,
        includeBarcode: true,
        includeOrderNumber: true,
    });

    const handleSavePrintSettings = () => {
        // Lógica para salvar as configurações, por exemplo, em um banco de dados ou localStorage.
        console.log("Configurações de impressão salvas:", printSettings);
        // Em um ambiente real, você faria uma chamada de API aqui.
    };

    return {
        printSettings,
        setPrintSettings,
        handleSavePrintSettings,
    };
};