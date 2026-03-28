import React from 'react';
import { Bot, Terminal, Shield, Activity, Cpu } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AgentCardProps {
  id: string;
  status: 'online' | 'offline';
  version: string;
  capabilities: string[];
}

export const AgentCard: React.FC<AgentCardProps> = ({ id, status, version, capabilities }) => {
  return (
    <div className="glass-card p-6 rounded-xl animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-3 rounded-lg",
            status === 'online' ? "bg-primary/10" : "bg-muted"
          )}>
            <Bot className={cn(
              "w-6 h-6",
              status === 'online' ? "text-primary animate-glow-pulse" : "text-muted-foreground"
            )} />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground tracking-tight">{id}</h3>
            <span className="text-xs font-mono text-muted-foreground uppercase opacity-70">Super Agent</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/5 bg-white/5">
          <div className={cn(
            "w-2 h-2 rounded-full",
            status === 'online' ? "bg-primary shadow-[0_0_8px_rgba(20,184,166,0.6)]" : "bg-muted-foreground"
          )} />
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            status === 'online' ? "text-primary" : "text-muted-foreground"
          )}>
            {status}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span>v{version}</span>
        </div>

        <div className="pt-4 border-t border-white/[0.05]">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Capabilities</p>
          <div className="flex flex-wrap gap-2">
            {capabilities.map(cap => (
              <div 
                key={cap} 
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary text-[11px] font-medium text-secondary-foreground border border-white/[0.03]"
              >
                {cap.includes('dns') ? <Activity className="w-3 h-3 text-primary" /> : <Shield className="w-3 h-3 text-primary" />}
                {cap}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
