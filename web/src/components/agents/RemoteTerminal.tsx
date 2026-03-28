import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal as TerminalIcon, Power, PowerOff, Wifi, WifiOff, Loader2, ExternalLink } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface RemoteTerminalProps {
  agentId: string;
  agentName: string;
}

export function RemoteTerminal({ agentId, agentName }: RemoteTerminalProps) {
  const { user, isSuperAdmin } = useAuth();
  const isSuperAdminUser = isSuperAdmin();

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [pendingCommands, setPendingCommands] = useState<Set<string>>(new Set());

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inputBufferRef = useRef("");
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const cwdRef = useRef("/");
  const currentLineRef = useRef("");

  const getPrompt = useCallback(() => {
    const cwd = cwdRef.current === "/" ? "/" : cwdRef.current;
    return `\x1b[32mroot@${agentName}:${cwd}#\x1b[0m `;
  }, [agentName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "disconnect",
          payload: {},
        });
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      (supabase
        .from("agents" as any)
        .update({ shell_session_active: false })
        .eq("id", agentId) as any).then(() => {});
      xtermRef.current?.dispose();
    };
  }, [agentId]);

  // Initialize xterm when connected
  useEffect(() => {
    if (!connected || !terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#000000",
        foreground: "#d4d4d4",
        cursor: "#22c55e",
        cursorAccent: "#000000",
        selectionBackground: "#264f78",
        green: "#22c55e",
        red: "#f87171",
        yellow: "#ca8a04",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    // Small delay for DOM to settle
    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
    }, 50);

    term.writeln("\x1b[33m⏳ Canal WebSocket estabelecido.\x1b[0m");
    term.writeln("\x1b[33m⏳ Aguardando agente conectar...\x1b[0m");

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [connected]);

  // Setup xterm input handling when agentReady changes
  useEffect(() => {
    const term = xtermRef.current;
    if (!term || !agentReady) return;

    term.writeln("");
    term.writeln("\x1b[33m✅ Agente conectado. Sessão remota pronta.\x1b[0m");
    term.writeln('\x1b[33mDigite "clear" para limpar ou "exit" para desconectar.\x1b[0m');
    term.writeln("");
    term.write(getPrompt());
    term.focus();

    const disposable = term.onData((data) => {
      if (!channelRef.current) return;

      const hasPending = pendingCommands.size > 0;

      // Ctrl+C
      if (data === "\x03") {
        if (hasPending && channelRef.current) {
          term.write("^C\r\n");
          channelRef.current.send({
            type: "broadcast",
            event: "signal",
            payload: { signal: "SIGINT" },
          });
          setTimeout(() => {
            setPendingCommands(new Set());
            term.write(getPrompt());
          }, 1500);
        }
        return;
      }

      // Ctrl+L — clear
      if (data === "\x0c") {
        term.clear();
        term.write(getPrompt());
        inputBufferRef.current = "";
        return;
      }

      // Don't accept input while command is pending
      if (hasPending) return;

      // Enter
      if (data === "\r") {
        const trimmed = inputBufferRef.current.trim();
        term.write("\r\n");
        inputBufferRef.current = "";
        historyIndexRef.current = -1;
        currentLineRef.current = "";

        if (!trimmed) {
          term.write(getPrompt());
          return;
        }

        commandHistoryRef.current.push(trimmed);

        if (trimmed === "clear") {
          term.clear();
          term.write(getPrompt());
          return;
        }
        if (trimmed === "exit") {
          handleDisconnect();
          return;
        }

        const commandId = crypto.randomUUID();
        setPendingCommands((prev) => new Set(prev).add(commandId));

        channelRef.current.send({
          type: "broadcast",
          event: "command",
          payload: { command: trimmed, id: commandId },
        });
        return;
      }

      // Backspace
      if (data === "\x7f") {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      // Arrow up
      if (data === "\x1b[A") {
        const history = commandHistoryRef.current;
        if (history.length === 0) return;
        if (historyIndexRef.current === -1) {
          currentLineRef.current = inputBufferRef.current;
          historyIndexRef.current = history.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
        }
        clearLine(term);
        inputBufferRef.current = history[historyIndexRef.current];
        term.write(inputBufferRef.current);
        return;
      }

      // Arrow down
      if (data === "\x1b[B") {
        if (historyIndexRef.current === -1) return;
        historyIndexRef.current++;
        clearLine(term);
        if (historyIndexRef.current >= commandHistoryRef.current.length) {
          historyIndexRef.current = -1;
          inputBufferRef.current = currentLineRef.current;
        } else {
          inputBufferRef.current = commandHistoryRef.current[historyIndexRef.current];
        }
        term.write(inputBufferRef.current);
        return;
      }

      // Regular character
      if (data >= " " || data === "\t") {
        inputBufferRef.current += data;
        term.write(data);
      }
    });

    return () => disposable.dispose();
  }, [agentReady, getPrompt]);

  // Helper to clear current input line in xterm
  function clearLine(term: Terminal) {
    const len = inputBufferRef.current.length;
    term.write("\b".repeat(len) + " ".repeat(len) + "\b".repeat(len));
  }

  // Setup broadcast channel when connected
  useEffect(() => {
    if (!connected || !isSuperAdminUser) return;

    const channel = supabase.channel(`shell:${agentId}`, {
      config: {
        broadcast: { self: false },
      },
    });

    channel.on("broadcast", { event: "output" }, ({ payload }) => {
      if (!payload?.data || !xtermRef.current) return;
      xtermRef.current.write(payload.data);
    });

    channel.on("broadcast", { event: "error" }, ({ payload }) => {
      if (!payload?.data || !xtermRef.current) return;
      xtermRef.current.write(`\x1b[31m${payload.data}\x1b[0m`);
    });

    channel.on("broadcast", { event: "done" }, ({ payload }) => {
      if (payload?.cwd) cwdRef.current = payload.cwd;
      setPendingCommands((prev) => {
        const next = new Set(prev);
        next.delete(payload?.id);
        return next;
      });
      // Write new prompt
      if (xtermRef.current) {
        xtermRef.current.write("\r\n" + getPrompt());
      }
    });

    channel.on("broadcast", { event: "ready" }, () => {
      setAgentReady(true);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setChannelReady(true);
        setConnecting(false);
        // Send wake event to instantly trigger the Supervisor's RealtimeShell
        channel.send({
          type: "broadcast",
          event: "wake",
          payload: { timestamp: Date.now() },
        });
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
      setAgentReady(false);
    };
  }, [connected, agentId, isSuperAdminUser, getPrompt]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await (supabase
        .from("agents" as any)
        .update({ shell_session_active: true })
        .eq("id", agentId) as any);
    } catch (e) {
      console.error("Failed to set shell_session_active:", e);
    }
    setConnected(true);
  };

  const handleDisconnect = async () => {
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: "broadcast",
          event: "disconnect",
          payload: {},
        });
      } catch {}
    }

    try {
      await (supabase
        .from("agents" as any)
        .update({ shell_session_active: false })
        .eq("id", agentId) as any);
    } catch (e) {
      console.error("Failed to clear shell_session_active:", e);
    }

    setConnected(false);
    setConnecting(false);
    setChannelReady(false);
    setAgentReady(false);
    setPendingCommands(new Set());
    inputBufferRef.current = "";
    commandHistoryRef.current = [];
    historyIndexRef.current = -1;
    cwdRef.current = "/";
  };

  if (!isSuperAdminUser) return null;

  if (!connected && !connecting) {
    return (
      <div className="lg:col-span-2 rounded-lg border border-border/50 bg-black/90 p-6 flex flex-col items-center justify-center gap-4 min-h-[200px]">
        <TerminalIcon className="w-10 h-10 text-green-500 opacity-60" />
        <p className="text-sm text-gray-400 font-mono">Terminal Remoto — {agentName}</p>
        <Button onClick={handleConnect} variant="outline" className="border-green-600 text-green-500 hover:bg-green-950 hover:text-green-400">
          <Power className="w-4 h-4 mr-2" />
          Conectar
        </Button>
      </div>
    );
  }

  if (connecting && !connected) {
    return (
      <div className="lg:col-span-2 rounded-lg border border-border/50 bg-black/90 p-6 flex flex-col items-center justify-center gap-4 min-h-[200px]">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin" />
        <p className="text-sm text-green-400 font-mono animate-pulse">Estabelecendo conexão WebSocket...</p>
        <p className="text-xs text-gray-500 font-mono">Conectando a {agentName}</p>
      </div>
    );
  }

  return (
    <div className="lg:col-span-2 rounded-lg border border-gray-700 bg-black overflow-hidden flex flex-col" style={{ height: "500px" }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500 cursor-pointer hover:brightness-125" onClick={handleDisconnect} title="Desconectar" />
            <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-50" />
            <div className="w-3 h-3 rounded-full bg-green-500 opacity-50" />
          </div>
          <span className="text-gray-400 text-xs font-mono ml-2">
            Terminal Remoto — {agentName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {agentReady ? (
            <Badge variant="secondary" className="bg-green-900/50 text-green-400 text-[10px] border-green-700/50 px-1.5 py-0.5">
              <Wifi className="w-2.5 h-2.5 mr-1" />
              Conectado
            </Badge>
          ) : channelReady ? (
            <Badge variant="secondary" className="bg-yellow-900/50 text-yellow-400 text-[10px] border-yellow-700/50 px-1.5 py-0.5">
              <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
              Aguardando agente...
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-gray-800 text-gray-500 text-[10px] border-gray-700 px-1.5 py-0.5">
              <WifiOff className="w-2.5 h-2.5 mr-1" />
              Conectando...
            </Badge>
          )}
          <button
            onClick={() => {
              const url = `/terminal/${agentId}?name=${encodeURIComponent(agentName)}`;
              window.open(url, `terminal-${agentId}`, "width=900,height=600,menubar=no,toolbar=no");
              // Disconnect the embedded terminal so only the pop-out owns the session
              handleDisconnect();
            }}
            className="text-gray-500 hover:text-blue-400 transition-colors"
            title="Abrir em nova janela"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDisconnect}
            className="text-gray-500 hover:text-red-400 transition-colors"
            title="Desconectar"
          >
            <PowerOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal body — xterm.js container */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-hidden"
        style={{ padding: "4px" }}
      />
    </div>
  );
}
