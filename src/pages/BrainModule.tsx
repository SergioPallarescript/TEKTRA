import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Brain, Send, Bot, User, Loader2, FileText, Mic, MicOff, History, Plus, MessageSquare, Pencil, Trash2, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { syncProjectMemory } from "@/lib/projectMemory";
import { ScrollArea } from "@/components/ui/scroll-area";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; created_at: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brain-chat`;

const BrainModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [docNames, setDocNames] = useState<string[]>([]);
  const [ordersHistory, setOrdersHistory] = useState<string>("");
  const [incidentsHistory, setIncidentsHistory] = useState<string>("");
  const [dynamicMemory, setDynamicMemory] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const voiceRecognitionRef = useRef<any>(null);

  // Conversation history
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>(() => crypto.randomUUID());
  const [showHistory, setShowHistory] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch conversation history
  const fetchConversations = useCallback(async () => {
    if (!projectId || !user) return;
    const { data } = await (supabase.from("brain_messages") as any)
      .select("conversation_id, conversation_title, created_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("role", "user")
      .not("conversation_id", "is", null)
      .order("created_at", { ascending: false });

    if (data) {
      const uniqueMap = new Map<string, Conversation>();
      data.forEach((d: any) => {
        if (d.conversation_id && !uniqueMap.has(d.conversation_id)) {
          uniqueMap.set(d.conversation_id, {
            id: d.conversation_id,
            title: d.conversation_title || "Consulta sin título",
            created_at: d.created_at,
          });
        }
      });
      setConversations(Array.from(uniqueMap.values()));
    }
  }, [projectId, user]);

  // Load a past conversation
  const loadConversation = async (convId: string) => {
    if (!projectId || !user) return;
    const { data } = await (supabase.from("brain_messages") as any)
      .select("role, content, created_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (data) {
      setMessages(data.map((d: any) => ({ role: d.role as "user" | "assistant", content: d.content })));
      setCurrentConversationId(convId);
      setShowHistory(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(crypto.randomUUID());
    setShowHistory(false);
  };

  // Rename conversation
  const renameConversation = async (convId: string, newTitle: string) => {
    if (!projectId || !user || !newTitle.trim()) return;
    await (supabase.from("brain_messages") as any)
      .update({ conversation_title: newTitle.trim() })
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("conversation_id", convId);
    setEditingConvId(null);
    fetchConversations();
    toast.success("Conversación renombrada");
  };

  // Delete conversation
  const deleteConversation = async (convId: string) => {
    if (!projectId || !user) return;
    await (supabase.from("brain_messages") as any)
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("conversation_id", convId);
    setDeleteConfirmId(null);
    if (currentConversationId === convId) startNewConversation();
    fetchConversations();
    toast.success("Conversación eliminada");
  };

  useEffect(() => {
    if (!projectId) return;
    supabase.from("projects").select("*").eq("id", projectId).single().then(({ data }) => setProject(data));
    fetchConversations();

    const fetchAllContext = async () => {
      const [{ data: docs }, { data: plans }] = await Promise.all([
        supabase.from("project_documents").select("file_name").eq("project_id", projectId),
        supabase.from("plans").select("name, category").eq("project_id", projectId),
      ]);
      const names: string[] = [];
      if (docs) names.push(...docs.map((d: any) => d.file_name));
      if (plans) names.push(...plans.map((p: any) => `[Plano] ${p.name} (${p.category || "sin categoría"})`));
      setDocNames(names);

      const { data: orders } = await supabase
        .from("orders")
        .select("order_number, content, created_at, created_by, profiles:created_by(full_name, role)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (orders && orders.length > 0) {
        const lines = orders.map((o: any) => {
          const profile = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
          return `[Orden #${o.order_number}] Fecha: ${new Date(o.created_at).toLocaleDateString("es-ES")} | Autor: ${profile?.full_name || "Desconocido"} (${profile?.role || "N/A"})\n${o.content}`;
        });
        setOrdersHistory(lines.join("\n---\n"));
      }

      const { data: incidents } = await supabase
        .from("incidents")
        .select("incident_number, content, severity, status, remedial_actions, created_at, created_by, profiles:created_by(full_name, role)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (incidents && incidents.length > 0) {
        const lines = incidents.map((inc: any) => {
          const profile = Array.isArray(inc.profiles) ? inc.profiles[0] : inc.profiles;
          return `[Incidencia #${inc.incident_number}] Fecha: ${new Date(inc.created_at).toLocaleDateString("es-ES")} | Autor: ${profile?.full_name || "Desconocido"} (${profile?.role || "N/A"}) | Severidad: ${inc.severity} | Estado: ${inc.status}\n${inc.content}${inc.remedial_actions ? `\nAcciones correctoras: ${inc.remedial_actions}` : ""}`;
        });
        setIncidentsHistory(lines.join("\n---\n"));
      }

      try { const memory = await syncProjectMemory(projectId); setDynamicMemory(memory.content || ""); } catch { setDynamicMemory(""); }
    };
    fetchAllContext();
  }, [projectId, fetchConversations]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const saveMessage = async (role: string, content: string, convTitle?: string) => {
    if (!projectId || !user) return;
    await (supabase.from("brain_messages") as any).insert({
      project_id: projectId, user_id: user.id, role, content,
      conversation_id: currentConversationId,
      conversation_title: convTitle || null,
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const isFirstMessage = messages.length === 0;
    const convTitle = isFirstMessage ? userMsg.content.substring(0, 80) : undefined;
    await saveMessage("user", userMsg.content, convTitle);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      let freshDynamicMemory = dynamicMemory;
      if (projectId) {
        try { const memory = await syncProjectMemory(projectId); freshDynamicMemory = memory.content || ""; setDynamicMemory(freshDynamicMemory); } catch { freshDynamicMemory = dynamicMemory; }
      }

      const projectContext = project
        ? [
            `Proyecto: ${project.name}`, `Dirección: ${project.address || "N/A"}`, `Descripción: ${project.description || "N/A"}`,
            ``, `=== FUENTE 1: DOCUMENTOS ORIGINALES DEL PROYECTO ===`,
            docNames.length > 0 ? docNames.map((n, i) => `${i + 1}. ${n}`).join("\n") : "No hay documentos subidos aún.",
            ``, `=== FUENTE 2: HISTORIAL DEL LIBRO DE ÓRDENES ===`, ordersHistory || "No hay órdenes registradas aún.",
            ``, `=== FUENTE 3: HISTORIAL DEL LIBRO DE INCIDENCIAS ===`, incidentsHistory || "No hay incidencias registradas aún.",
            ``, `=== HISTORIAL DE EJECUCIÓN ACTUALIZADO ===`, freshDynamicMemory || "No hay historial disponible.",
            ``, `REGLAS DE JERARQUÍA:`,
            `1. Usa las tres fuentes como un cuerpo de conocimiento unificado.`,
            `2. Si hay contradicción entre un documento original y una orden/incidencia posterior, PRIORIZA la información más reciente.`,
            `3. Cuando cites información, SIEMPRE indica la fuente exacta.`,
          ].join("\n")
        : undefined;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ messages: [...messages, userMsg], projectContext, projectId, dynamicContext: freshDynamicMemory }),
      });

      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "Error del servidor"); }
      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { textBuffer = line + "\n" + textBuffer; break; }
        }
      }

      if (assistantSoFar) { await saveMessage("assistant", assistantSoFar); fetchConversations(); }
    } catch (e: any) {
      toast.error(e.message || "Error al consultar el Cerebro de Obra");
      setMessages((prev) => prev.filter((m) => m !== userMsg));
    } finally { setIsLoading(false); }
  };

  const toggleVoiceRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { toast.error("Tu navegador no soporta reconocimiento de voz"); return; }
    if (voiceRecording) { voiceRecognitionRef.current?.stop(); voiceRecognitionRef.current = null; setVoiceRecording(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    voiceRecognitionRef.current = recognition;
    recognition.lang = "es-ES"; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event: any) => { let transcript = ""; for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript; setInput(transcript); };
    recognition.onerror = (e: any) => { if (e.error === "no-speech" || e.error === "aborted") return; setVoiceRecording(false); voiceRecognitionRef.current = null; };
    recognition.onend = () => { if (voiceRecognitionRef.current) { try { recognition.start(); } catch { /* already started */ } } };
    recognition.start(); setVoiceRecording(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  return (
    <AppLayout>
      <div className="flex" style={{ height: "calc(100vh - 56px - 40px)" }}>
        {/* History sidebar */}
        <div className={`${showHistory ? "w-72 border-r border-border" : "w-0"} transition-all overflow-hidden bg-card shrink-0`}>
          <div className="p-3 border-b border-border flex items-center justify-between">
            <p className="text-xs font-display uppercase tracking-wider text-muted-foreground">Historial</p>
            <Button variant="ghost" size="sm" onClick={startNewConversation} className="gap-1 text-xs">
              <Plus className="h-3 w-3" /> Nueva
            </Button>
          </div>
          <ScrollArea className="h-[calc(100%-48px)]">
            <div className="p-2 space-y-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin conversaciones previas</p>
              ) : (
                conversations.map(conv => (
                  <div key={conv.id} className={`group relative rounded-md transition-colors ${conv.id === currentConversationId ? "bg-secondary" : "hover:bg-secondary/50"}`}>
                    {editingConvId === conv.id ? (
                      <div className="flex items-center gap-1 p-2">
                        <Input
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          className="h-6 text-xs"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") renameConversation(conv.id, editingTitle); if (e.key === "Escape") setEditingConvId(null); }}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => renameConversation(conv.id, editingTitle)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingConvId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : deleteConfirmId === conv.id ? (
                      <div className="p-2 space-y-1">
                        <p className="text-[10px] text-destructive">¿Eliminar esta conversación?</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={() => deleteConversation(conv.id)}>Eliminar</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => loadConversation(conv.id)} className="w-full text-left p-2 text-xs">
                        <p className="truncate font-medium pr-12">{conv.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(conv.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                        </p>
                        <div className="absolute right-1 top-1.5 hidden group-hover:flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main chat */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}><ArrowLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)}><History className="h-4 w-4" /></Button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Cerebro de Obra</p>
                <h1 className="font-display text-lg font-bold tracking-tighter truncate">Conocimiento acumulativo</h1>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/docs`)} className="text-xs font-display uppercase tracking-wider gap-1">
                <FileText className="h-3.5 w-3.5" /> Docs ({docNames.length})
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <Brain className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                <h2 className="font-display text-lg font-semibold text-muted-foreground mb-2">Cerebro de Obra</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Integro <strong>tres fuentes</strong> de conocimiento: documentos del proyecto, historial de órdenes e historial de incidencias.
                </p>
                {docNames.length > 0 && (
                  <div className="mt-4 p-3 bg-card border border-border rounded-lg max-w-md mx-auto text-left">
                    <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">{docNames.length} documentos disponibles</p>
                    <div className="space-y-1">
                      {docNames.slice(0, 5).map((n, i) => <p key={i} className="text-xs text-muted-foreground truncate">• {n}</p>)}
                      {docNames.length > 5 && <p className="text-xs text-muted-foreground">...y {docNames.length - 5} más</p>}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 justify-center mt-6">
                  {["¿Qué documentos y registros tenemos?", "Resume las últimas órdenes e incidencias", "¿Hay contradicciones entre el proyecto y las órdenes?", "¿Qué falta para el cierre de obra?"].map((q) => (
                    <button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 text-xs border border-border rounded-full hover:border-foreground/20 transition-colors text-muted-foreground hover:text-foreground">{q}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="shrink-0 w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center mt-1"><Bot className="h-4 w-4 text-accent" /></div>
                )}
                <div className={`max-w-[80%] rounded-lg px-4 py-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-foreground"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center mt-1"><User className="h-4 w-4 text-primary-foreground" /></div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center"><Loader2 className="h-4 w-4 text-accent animate-spin" /></div>
                <div className="bg-card border border-border rounded-lg px-4 py-3"><p className="text-sm text-muted-foreground">Consultando documentos...</p></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border px-4 py-3">
            <div className="flex gap-2 max-w-3xl mx-auto items-end">
              <Button type="button" variant={voiceRecording ? "destructive" : "outline"} size="icon" onClick={toggleVoiceRecording} className="shrink-0 relative">
                {voiceRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voiceRecording && <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-pulse" />}
              </Button>
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Pregunta sobre los documentos del proyecto..." rows={1} className="resize-none min-h-[40px] max-h-[120px]" />
              <Button onClick={sendMessage} disabled={!input.trim() || isLoading} size="icon" className="shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default BrainModule;
