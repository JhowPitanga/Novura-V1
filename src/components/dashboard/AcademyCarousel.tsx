import { useState } from "react";
import { Play, Clock, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Course {
    id: number;
    titulo: string;
    duracao: string;
    nivel: string;
    avaliacao: number;
    thumbnail: string;
    categoria: string;
}

interface AcademyCarouselProps {
    courses: Course[];
    itemsPerSlide?: number;
}

export function AcademyCarousel({ courses, itemsPerSlide = 3 }: AcademyCarouselProps) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const totalSlides = Math.ceil(courses.length / itemsPerSlide);
    const visibleItems = courses.slice(currentSlide * itemsPerSlide, (currentSlide + 1) * itemsPerSlide);

    return (
        <div>
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Academia Novura</h2>
                    <p className="text-gray-600 mt-1">Aprenda a dominar todas as funcionalidades do sistema</p>
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-xl">
                    <Link to="/novura-academy">
                        Ver Todos os Cursos
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                </Button>
            </div>

            <div className="relative">
                <div className="flex justify-center space-x-6">
                    {visibleItems.map((aula) => (
                        <Card
                            key={aula.id}
                            className="w-80 border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer bg-white rounded-xl overflow-hidden group"
                        >
                            <CardContent className="p-0">
                                <div className="relative">
                                    <img
                                        src={aula.thumbnail}
                                        alt={aula.titulo}
                                        className="w-full h-48 object-cover bg-gray-100"
                                    />
                                    <div className="absolute inset-0 bg-black/20"></div>
                                    <div className="absolute top-4 left-4">
                                        <Badge className="bg-novura-primary text-white">{aula.categoria}</Badge>
                                    </div>
                                    <div className="absolute top-4 right-4">
                                        <Badge variant="outline" className="bg-white/90 text-gray-700">{aula.nivel}</Badge>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                            <Play className="w-6 h-6 text-novura-primary ml-1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-1">{aula.titulo}</h3>
                                    <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                                        <div className="flex items-center space-x-1">
                                            <Clock className="w-4 h-4" />
                                            <span>{aula.duracao}</span>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            <Star className="w-4 h-4 text-yellow-500 fill-current" />
                                            <span>{aula.avaliacao}</span>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                        <div
                                            className="bg-novura-primary h-1.5 rounded-full"
                                            style={{ width: `${Math.random() * 100}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        {Math.floor(Math.random() * 80 + 10)}% concluído
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {totalSlides > 1 && (
                    <>
                        <Button
                            variant="outline"
                            size="icon"
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg hover:shadow-xl"
                            onClick={() => setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides)}
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg hover:shadow-xl"
                            onClick={() => setCurrentSlide(prev => (prev + 1) % totalSlides)}
                        >
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
