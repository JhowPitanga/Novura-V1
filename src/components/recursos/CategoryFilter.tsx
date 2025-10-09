
interface Category {
  id: string;
  nome: string;
  count: number;
}

interface CategoryFilterProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
}

export function CategoryFilter({ categories, activeCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-center text-base font-semibold">Categorias populares</h3>
      <div className="flex flex-wrap gap-2 justify-center">
        {categories.map((categoria) => {
          const isActive = activeCategory === categoria.id;
          return (
            <button
              key={categoria.id}
              onClick={() => onCategoryChange(categoria.id)}
              className={`px-3 py-2 rounded-lg border text-sm transition hover:shadow-sm ${isActive ? "bg-novura-primary text-white border-novura-primary" : "bg-white text-gray-800"}`}
              aria-pressed={isActive}
            >
              <span className="font-medium">{categoria.nome}</span>
              <span className="ml-2 text-xs text-gray-500">{categoria.count} itens</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
