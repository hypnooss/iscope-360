import * as React from 'react';
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Users,
  LogOut,
  Menu,
  X,
  Settings,
  Bot,
  Cpu,
  BookOpen,
} from 'lucide-react';
import logoIscope from '@/assets/logo-iscope.png';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const { effectiveProfile, effectiveRole } = useEffectiveAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebar-open');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('sidebar-open', String(sidebarOpen));
  }, [sidebarOpen]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };


  // Sidebar link component
  const SidebarLink = ({ to, icon: Icon, label, isActive }: { to: string; icon: React.ElementType; label: string; isActive: boolean }) => {
    const linkContent = (
      <Link
        to={to}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary shadow-sm border border-primary/20'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
          !sidebarOpen && 'justify-center'
        )}
      >
        <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
        {sidebarOpen && label}
      </Link>
    );

    if (!sidebarOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  const NavContent = () => (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-1">
        <SidebarLink 
          to="/dashboard" 
          icon={LayoutDashboard} 
          label="Dashboard" 
          isActive={location.pathname === '/dashboard'} 
        />
        
        <SidebarLink 
          to="/agents" 
          icon={Bot} 
          label="Agents" 
          isActive={location.pathname.startsWith('/agents')} 
        />

        <SidebarLink 
          to="/super-agents" 
          icon={Cpu} 
          label="Super Agents" 
          isActive={location.pathname.startsWith('/super-agents')} 
        />

        <div className="my-4 border-t border-border/40 mx-2" />

        <SidebarLink 
          to="/users" 
          icon={Users} 
          label="Usuários" 
          isActive={location.pathname === '/users'} 
        />

        <SidebarLink 
          to="/settings" 
          icon={Settings} 
          label="Configurações" 
          isActive={location.pathname === '/settings'} 
        />

        <SidebarLink 
          to="/docs" 
          icon={BookOpen} 
          label="Documentação" 
          isActive={location.pathname === '/docs'} 
        />
      </div>
    </TooltipProvider>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <img src={logoIscope} alt="iScope 360" className="h-6 w-auto" />
          <span className="font-bold text-foreground">iScope 360</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border z-50 transform transition-transform duration-200',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
          <img src={logoIscope} alt="iScope 360" className="h-6 w-auto" />
          <span className="font-bold text-sidebar-foreground">iScope 360</span>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
          <NavContent />
        </nav>
      </aside>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'hidden lg:flex flex-col h-screen sticky top-0 border-r border-border bg-card transition-all duration-300',
            sidebarOpen ? 'w-64' : 'w-16'
          )}
        >
          {/* Logo & Toggle */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            {sidebarOpen && (
              <div className="flex items-center gap-2">
                <img src={logoIscope} alt="iScope 360" className="h-6 w-auto" />
                <span className="font-bold text-foreground">iScope 360</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", !sidebarOpen && "mx-auto")}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          </div>

          <nav className="p-3 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
            <NavContent />
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors",
                  !sidebarOpen && "justify-center"
                )}>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={effectiveProfile?.avatar_url || profile?.avatar_url || ''} />
                    <AvatarFallback>{getInitials(effectiveProfile?.full_name || profile?.full_name)}</AvatarFallback>
                  </Avatar>
                  {sidebarOpen && (
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium leading-none text-foreground truncate">
                        {effectiveProfile?.full_name || profile?.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {effectiveRole || role}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 bg-background overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
