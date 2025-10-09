import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";
import type { Event } from "./types";

const initialEvents: Event[] = [
  { id: "e1", title: "Meetup da Comunidade", date: "2025-10-20", location: "Online", description: "Troca de experiências de sellers." },
];

export function EventosTab() {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");

  const addEvent = () => {
    if (!title || !date) return;
    const ev: Event = { id: Math.random().toString(36).slice(2), title, date, location };
    setEvents((prev) => [ev, ...prev]);
    setTitle("");
    setDate("");
    setLocation("");
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Título do evento" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Local (opcional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Button className="bg-novura-primary text-white" onClick={addEvent}>Criar evento</Button>
        </div>
      </Card>

      <div className="space-y-3">
        {events.map((ev) => (
          <Card key={ev.id} className="p-4 border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-900">{ev.title}</div>
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> {new Date(ev.date).toLocaleDateString()}
                  {ev.location && <span>• {ev.location}</span>}
                </div>
                {ev.description && <p className="text-sm text-gray-700 mt-2">{ev.description}</p>}
              </div>
              <Button variant="outline">Detalhes</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}