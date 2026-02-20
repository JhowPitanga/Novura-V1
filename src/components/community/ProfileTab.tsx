// src/components/comunidade/PerfilTab.tsx

import React from 'react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Check, ShieldCheck, Sparkles, Award } from 'lucide-react';

export const ProfileTab: React.FC = () => {
  const profile = {
    name: 'Novura ERP',
    role: 'ERP Oficial',
    avatarUrl: '', // sem foto força o fallback
    coverUrl: '', // sem imagem de capa, usaremos um gradiente
    followers: 124500,
    posts: 542,
    badges: [
      { id: 'b1', label: 'Confiável', icon: ShieldCheck },
      { id: 'b2', label: 'Inovador', icon: Sparkles },
      { id: 'b3', label: 'Excelência', icon: Award },
    ],
  };

  return (
    <div className="space-y-6">
      {/* CAPA */}
      <div className="relative h-40 md:h-52 w-full rounded-xl overflow-hidden">
        {/* Gradiente roxo como capa */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-700" />

        {/* FOTO sobre a capa */}
        <div className="absolute left-6 bottom-4 flex items-end">
          <Avatar className="w-20 h-20 ring-4 ring-white shadow-lg">
            <AvatarImage src={profile.avatarUrl} alt={profile.name} />
            <AvatarFallback className="bg-gray-100 text-gray-500 font-semibold">N</AvatarFallback>
          </Avatar>

          {/* Nome e selo oficial */}
          <div className="ml-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-white drop-shadow-sm">
                {profile.name}
              </h1>
              {/* Selo roxo preenchido com check branco */}
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-purple-700 border border-purple-500 shadow-sm">
                <Check className="w-4 h-4 text-white" />
              </span>
            </div>
            <p className="text-sm text-purple-100">{profile.role}</p>
          </div>
        </div>
      </div>

      {/* Estatísticas básicas e ações */}
      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm text-gray-500">Seguidores</p>
            <p className="text-xl font-semibold text-purple-700">{Intl.NumberFormat('pt-BR').format(profile.followers)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Postagens</p>
            <p className="text-xl font-semibold text-purple-700">{Intl.NumberFormat('pt-BR').format(profile.posts)}</p>
          </div>
        </div>
      </Card>

      {/* Conquistas e Emblemas */}
      <Card className="p-4 md:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Conquistas e Emblemas</h2>
        <div className="flex flex-wrap gap-3">
          {profile.badges.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.id}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-purple-50 text-purple-700 border border-purple-200"
                title={b.label}
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600">
                  <Icon className="w-3.5 h-3.5 text-white" />
                </span>
                <span className="text-sm font-medium">{b.label}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};