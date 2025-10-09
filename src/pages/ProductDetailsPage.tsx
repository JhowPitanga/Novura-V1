import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { ShoppingBag, Star } from "lucide-react";

export default function ProductDetailsPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const product = state?.product as any;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">

          <GlobalHeader />

          <main className="flex-1 overflow-auto p-6 space-y-6">
            {!product ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-gray-700">Produto {id} não encontrado no estado. Volte para o marketplace e selecione um item.</p>
                <Button variant="outline" className="mt-2" onClick={() => navigate("/recursos-seller")}>Voltar</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 bg-white rounded-xl border p-4">
                  <img src={product.image} alt={product.nome} className="w-full h-64 object-cover rounded-lg" />
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="outline">{product.categoria}</Badge>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white rounded-xl border p-4">
                    <h1 className="text-2xl font-semibold text-gray-900">{product.nome}</h1>
                    <p className="text-gray-600 mt-1">{product.descricao}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-3xl font-bold text-novura-primary">R$ {product.preco?.toFixed(2)}</span>
                      <Button className="bg-novura-primary hover:bg-novura-primary/90" onClick={() => navigate("/recursos-seller")}>Comprar agora</Button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border p-4">
                    <h2 className="text-lg font-semibold mb-4">Avaliações e comentários</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <div className="flex items-center gap-2">
                          <Star className="w-6 h-6 text-yellow-500" />
                          <span className="text-2xl font-bold">4,87</span>
                        </div>
                        <p className="text-sm text-gray-600">129 avaliações</p>
                        <div className="mt-3 space-y-2">
                          {[5,4,3,2,1].map((stars, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="w-4 text-sm">{stars}</span>
                              <Progress value={stars*17} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-4">
                        {[{
                          author: "Gojo Satoru",
                          date: "22 de dezembro de 2023",
                          text: "ADOREI! Ficou ótima na minha varanda. O painel de alumínio é um componente essencial com uma estética diferenciada.",
                          rating: 5
                        },{
                          author: "Kugisaki Nobara",
                          date: "18 de dezembro de 2023",
                          text: "Confortável e com bom custo-benefício. Atendeu a expectativa geral.",
                          rating: 4
                        }].map((review, i) => (
                          <div key={i} className="border rounded-xl p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {Array.from({ length: review.rating }).map((_, idx) => (
                                  <Star key={idx} className="w-4 h-4 text-yellow-500" />
                                ))}
                              </div>
                              <span className="text-sm text-gray-500">{review.date}</span>
                            </div>
                            <p className="mt-2 text-sm text-gray-800">
                              <strong>{review.author}</strong>: {review.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}