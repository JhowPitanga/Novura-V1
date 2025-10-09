import React from "react";

// Tipagem do Produto (alinhada com RecursosSeller)
interface Product {
  id: number;
  nome: string;
  preco: number;
  categoria: string;
  image: string;
  descricao: string;
  estoque: number;
  rating?: number;
  avaliacoes?: any[];
}

interface ProductCarouselProps {
  products: Product[];
  onProductClick: (product: Product) => void;
  className?: string;
}

// Carrossel simples horizontal com scroll nativo
export function ProductCarousel({ products, onProductClick, className }: ProductCarouselProps) {
  if (!products || products.length === 0) {
    return (
      <div className="text-gray-500 text-sm">Nenhum produto em destaque no momento.</div>
    );
  }

  return (
    <div className={"w-full " + (className ?? "")}>
      <div className="flex gap-4 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-gray-300">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => onProductClick(product)}
            className="min-w-[180px] w-[180px] bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow text-left"
          >
            <div className="w-full h-28 bg-gray-100 rounded-t-lg overflow-hidden">
              <img
                src={product.image}
                alt={product.nome}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold text-gray-900 truncate" title={product.nome}>
                {product.nome}
              </div>
              <div className="text-xs text-gray-500 truncate" title={product.descricao}>
                {product.descricao}
              </div>
              <div className="mt-2 text-purple-600 font-bold">R$ {product.preco.toFixed(2)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}