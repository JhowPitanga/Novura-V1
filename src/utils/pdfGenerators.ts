export function generatePdfBlob(content: string, _orientation = 'P'): string {
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Documento para Impressão</title>
            <style>
                @page { size: A4; margin: 20mm; }
                @media print { html, body { width: 210mm; height: 297mm; } }
                body { font-family: sans-serif; font-size: 12px; line-height: 1.5; }
                .page { page-break-after: always; padding: 20mm; }
                .picking-list h1 { text-align: center; }
                .picking-list .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                .picking-list .item { display: flex; align-items: center; border: 1px solid #eee; padding: 10px; margin-bottom: 10px; }
                .picking-list .item img { width: 60px; height: 60px; margin-right: 15px; }
                .picking-list .item .details { flex-grow: 1; }
                .picking-list .item .quantity { font-size: 1.2em; font-weight: bold; }
                .label { display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #000; padding: 10px; margin: 10px; }
                .label.size-10x15 { width: 9.5cm; height: 14.5cm; }
                .label.size-A4 { width: 9.5cm; height: 13.5cm; margin: 5mm; }
                .label .barcode { text-align: center; margin-top: 10px; }
            </style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    return URL.createObjectURL(blob);
}

export function generateFunctionalPickingListPDF(pedidos: any[], settings: any): string {
    let content = '';
    if (settings.groupByProduct) {
        const groupedItems: Record<string, { nome?: string; sku?: string; quantidade: number; pedidos: Set<string> }> = {};
        pedidos.forEach(p => p.itens.forEach((item: any) => {
            if (!groupedItems[item.sku]) {
                groupedItems[item.sku] = { ...item, quantidade: 0, pedidos: new Set() };
            }
            groupedItems[item.sku].quantidade += item.quantidade;
            groupedItems[item.sku].pedidos.add(p.id);
        }));

        content += `
            <div class="page picking-list">
                <h1>Lista de Separação Agrupada</h1>
                <div class="header">
                    <span>Data: ${new Date().toLocaleDateString()}</span>
                    <span>Total de Itens: ${Object.values(groupedItems).reduce((sum, item) => sum + item.quantidade, 0)}</span>
                </div>
                ${Object.values(groupedItems).map(item => `
                    <div class="item">
                        <div class="details">
                            <strong>${item.nome}</strong><br>
                            <small>SKU: ${item.sku}</small>
                            ${settings.includeOrderNumber ? `<br><small>Pedidos: ${Array.from(item.pedidos).map(id => `#${id}`).join(', ')}</small>` : ''}
                        </div>
                        <div class="quantity">Qtd: ${item.quantidade}</div>
                        ${settings.includeBarcode ? `<div class="barcode">COD BARRA</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        content = pedidos.map(pedido => `
            <div class="page picking-list">
                <h1>Lista de Separação do Pedido #${pedido.id}</h1>
                <div class="header">
                    <span>Marketplace: ${pedido.marketplace}</span>
                    <span>Cliente: ${pedido.cliente}</span>
                </div>
                ${pedido.itens.map((item: any) => `
                    <div class="item">
                        <div class="details">
                            <strong>${item.nome}</strong><br>
                            <small>SKU: ${item.sku}</small>
                        </div>
                        <div class="quantity">Qtd: ${item.quantidade}</div>
                        ${settings.includeBarcode ? `<div class="barcode">COD BARRA</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    return generatePdfBlob(content);
}

export function generateFunctionalLabelPDF(pedidos: any[], settings: any): string {
    const labelClass = settings.labelSize === "10x15" ? "size-10x15" : "size-A4";
    const labels = pedidos.map(pedido => {
        const numLabels = settings.separateLabelPerItem ? pedido.quantidadeTotal : 1;
        let labelHtml = '';
        for (let i = 0; i < numLabels; i++) {
            labelHtml += `
                <div class="label ${labelClass}">
                    <strong>Etiqueta de Envio</strong>
                    <div style="margin-top: 5px;">Pedido: #${pedido.id}</div>
                    <div style="margin-top: 5px;">Cliente: ${pedido.cliente}</div>
                    <div style="margin-top: 5px;">ID Plataforma: ${pedido.idPlataforma}</div>
                    <div style="margin-top: 5px;">Item: ${pedido.itens[0]?.nome}</div>
                    <div class="barcode">CÓDIGO DE BARRAS</div>
                </div>
            `;
        }
        return labelHtml;
    }).join('');

    return generatePdfBlob(labels);
}
