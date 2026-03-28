import React, { useEffect, useState } from 'react';
import { AgentCard } from './components/AgentCard';
import { LayoutDashboard, Shield, Bot, Search, Bell, User, Activity, Cpu } from 'lucide-react';

interface AgentInfo {
  id: string;
  status: 'online' | 'offline';
  version: string;
  capabilities: string[];
}

const App: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Simulação de metadados para os agentes (Em v2.0 virá da API)
  const fetchAgents = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      const data = await response.json();
      
      const onlineIds = data.online_agents as string[];
      
      // Mapeia os IDs online para o formato de visualização
      const updatedAgents = onlineIds.map(id => ({
        id,
        status: 'online' as const,
        version: '1.0.0',
        capabilities: ['dns.resolve', 'http.probe']
      }));

      setAgents(updatedAgents);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden cyber-grid">
      {/* Sidebar Mockup (Vision Style) */}
      <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col hidden lg:flex">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.5)]">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">iScope<span className="text-primary italic">360</span></span>
          </div>

          <nav className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 text-primary border border-primary/20 transition-all cursor-pointer">
              <LayoutDashboard size={18} />
              <span className="text-sm font-semibold">Dashboard</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg text-muted-foreground hover:bg-white/5 transition-all cursor-pointer">
              <Bot size={18} />
              <span className="text-sm font-medium">Agents</span>
            </div>
          </nav>
        </div>

        <div className="mt-auto p-6">
          <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-white/5">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">PRO PLAN</p>
            <p className="text-sm text-foreground/80 font-medium">Unlimited Power</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <header className="h-16 border-b border-border bg-background/50 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between px-8">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input 
                type="text" 
                placeholder="Search resources..." 
                className="bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-1.5 text-xs w-full focus:outline-none focus:border-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg hover:bg-white/5 cursor-pointer relative">
              <Bell size={18} className="text-muted-foreground" />
              <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </div>
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10">
              <User size={16} className="text-muted-foreground" />
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Agent Control Center</h1>
            <p className="text-muted-foreground text-sm">Monitor e gerencie seus super agents remotos em tempo real.</p>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Online Agents</p>
                <p className="text-2xl font-bold text-foreground mt-1">{agents.length}</p>
              </div>
              <Activity className="text-primary opacity-30" size={32} />
            </div>
            <div className="glass-card p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Total Capabilities</p>
                <p className="text-2xl font-bold text-foreground mt-1">{loading ? '—' : agents.length * 2}</p>
              </div>
              <Cpu className="text-primary opacity-30" size={32} />
            </div>
          </div>

          {/* Agents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {loading ? (
              <p className="text-muted-foreground italic">Fetching agent status...</p>
            ) : agents.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">Nenhum agente conectado no momento.</p>
                <p className="text-xs text-muted-foreground/60 mt-2">Inicie o Super Agent nativo para vê-lo aqui.</p>
              </div>
            ) : (
              agents.map(agent => (
                <AgentCard 
                  key={agent.id}
                  id={agent.id}
                  status={agent.status}
                  version={agent.version}
                  capabilities={agent.capabilities}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
