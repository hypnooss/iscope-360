import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { RemoteTerminal } from "@/components/agents/RemoteTerminal";

export default function TerminalPopoutPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const agentName = searchParams.get("name") || "Agent";

  useEffect(() => {
    document.title = `Terminal — ${agentName}`;
  }, [agentName]);

  if (!id) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-red-400 font-mono">
        Agent ID não informado.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-0">
      <RemoteTerminal agentId={id} agentName={agentName} />
    </div>
  );
}
