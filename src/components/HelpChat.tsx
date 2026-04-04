import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, Loader2, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface HelpChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SYSTEM_CONTEXT = `Eres el asistente de ayuda de TEKTRA, una plataforma de gestión de obras de construcción en España.

Tu función es ayudar a los usuarios a entender cómo usar la plataforma y resolver dudas operativas. Conoces en profundidad estas funcionalidades:

- **Dashboard de Proyectos**: Crear obras, invitar agentes (DO, DEM, CON, PRO, CSS). Botón "Nuevo Proyecto" para DO/DEM. Botón "Gestionar" para editar/eliminar proyectos.
- **Invitar Agentes**: Desde el interior de un proyecto, botón "Invitar Agente". Se introduce el email y el rol. El agente recibirá un email de invitación y al registrarse con ese email se vinculará automáticamente.
- **Documentación de Proyecto**: Subir y gestionar documentos base de la obra (memorias, pliegos, proyectos básicos).
- **Planos Válidos**: Subir planos con control de versiones. Solo DO y DEM pueden subir nuevas versiones. Al subir una nueva versión, la anterior queda como histórico. Todos los roles deben confirmar su conformidad individual con cada versión.
- **Cerebro de Obra**: IA que responde preguntas cruzando la documentación estática con el historial de órdenes e incidencias. Si hay contradicción, la orden más reciente tiene prioridad.
- **Metro Digital**: Herramienta para medir distancias y áreas sobre planos PDF. Pasos: 1) Cargar PDF, 2) Mover/zoom con scroll, 3) Calibrar con medida real, 4) Medir distancias, 5) Medir áreas, 6) Limpiar mediciones.
- **Libro de Órdenes**: Solo DEM registra órdenes de ejecución con texto y fotos.
- **Libro de Incidencias**: Solo CSS registra incidencias de seguridad con severidad y fotos.
- **Validación Económica**: Dos tipos de documentos:
  - *Certificaciones*: Requieren firma digital obligatoria de DEM y DO. Tras ambas firmas, el Promotor puede "Autorizar para Pago".
  - *Presupuestos*: Requieren validación técnica del DEM y firma del Promotor.
  - El constructor sube el documento con importe y concepto.
- **Firma Digital**: Dos métodos disponibles:
  - *Certificado Digital*: Cargar archivo .p12/.pfx e introducir contraseña. La app recuerda la contraseña para futuras firmas con el mismo certificado.
  - *Firma Manual*: Dibujo en canvas con hash SHA-256, huella y geolocalización.
- **Docs Finales (CFO)**: Certificado final de obra con puntos de control. DO/DEM pueden reclamar documentos faltantes con "Auditoría".
- **Diagrama Gantt**: Cronograma visual de hitos de obra generado automáticamente o manualmente.
- **Notificaciones**: Campana de alertas con notificaciones push para firmas, nuevos planos, órdenes, etc.

INSTRUCCIONES:
- Responde siempre en español, de forma concisa y práctica.
- Da instrucciones paso a paso cuando el usuario pregunte cómo hacer algo.
- Si no conoces la respuesta exacta, sugiere que contacten con soporte usando el botón "?" > "Enviar duda a soporte".
- Sé amable y profesional.`;

const HelpChat = ({ open, onOpenChange }: HelpChatProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "assistant", content: "¡Hola! Soy el asistente de TEKTRA. ¿En qué puedo ayudarte?" }]);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("help-chat", {
        body: {
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          systemContext: SYSTEM_CONTEXT,
        },
      });

      if (error) throw error;
      const reply = data?.reply || "No he podido procesar tu consulta.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error al conectar con el asistente. Inténtalo de nuevo." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-display flex items-center gap-2">
            <Bot className="h-5 w-5 text-accent" /> Asistente TEKTRA
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 min-h-0 overflow-y-auto" style={{ maxHeight: "55vh" }}>
          <div className="space-y-4 py-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && <Bot className="h-5 w-5 text-accent mt-1 shrink-0" />}
                <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                </div>
                {msg.role === "user" && <User className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <Bot className="h-5 w-5 text-accent mt-1 shrink-0" />
                <div className="bg-secondary rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="px-6 pb-6 pt-2 border-t border-border">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              className="flex-1"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpChat;
