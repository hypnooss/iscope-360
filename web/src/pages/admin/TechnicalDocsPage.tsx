import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Search,
  FileText,
  BookOpen,
  ChevronRight,
  Download,
  Clock,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { technicalDocs, DOCS_VERSION, DOCS_LAST_UPDATED, type DocModule } from '@/data/technicalDocs';

export default function TechnicalDocsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>(
    technicalDocs[0]?.modules[0]?.id || ''
  );
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      technicalDocs.forEach(cat => { initial[cat.id] = true; });
      return initial;
    }
  );

  // Find selected module
  const selectedModule = useMemo(() => {
    for (const cat of technicalDocs) {
      const found = cat.modules.find(m => m.id === selectedModuleId);
      if (found) return found;
    }
    return technicalDocs[0]?.modules[0];
  }, [selectedModuleId]);

  // Find parent category
  const selectedCategory = useMemo(() => {
    for (const cat of technicalDocs) {
      if (cat.modules.some(m => m.id === selectedModuleId)) return cat;
    }
    return technicalDocs[0];
  }, [selectedModuleId]);

  // Filter modules by search
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return technicalDocs;
    const q = searchQuery.toLowerCase();
    return technicalDocs
      .map(cat => ({
        ...cat,
        modules: cat.modules.filter(
          m =>
            m.name.toLowerCase().includes(q) ||
            m.sections.some(
              s =>
                s.title.toLowerCase().includes(q) ||
                s.content.toLowerCase().includes(q)
            )
        ),
      }))
      .filter(cat => cat.modules.length > 0);
  }, [searchQuery]);

  // Filter sections by search within selected module
  const filteredSections = useMemo(() => {
    if (!selectedModule) return [];
    if (!searchQuery.trim()) return selectedModule.sections;
    const q = searchQuery.toLowerCase();
    return selectedModule.sections.filter(
      s => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
    );
  }, [selectedModule, searchQuery]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <aside className="w-72 border-r border-border bg-muted/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-sm">Documentação Técnica</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Tag className="w-3 h-3" />
              <span>{DOCS_VERSION}</span>
              <span>•</span>
              <Clock className="w-3 h-3" />
              <span>{DOCS_LAST_UPDATED}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar na documentação..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <nav className="p-2 space-y-1">
              {filteredDocs.map(cat => (
                <div key={cat.id}>
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 transition-transform',
                        expandedCategories[cat.id] && 'rotate-90'
                      )}
                    />
                    {cat.name}
                  </button>
                  {expandedCategories[cat.id] && (
                    <div className="ml-3 space-y-0.5">
                      {cat.modules.map(mod => (
                        <button
                          key={mod.id}
                          onClick={() => setSelectedModuleId(mod.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors text-left',
                            selectedModuleId === mod.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          {mod.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </ScrollArea>

          <div className="p-3 border-t border-border">
            <Button variant="outline" size="sm" className="w-full text-xs" disabled>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Exportar PDF (em breve)
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          {selectedModule ? (
            <ScrollArea className="h-full">
              <div className="max-w-4xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{selectedCategory?.name}</span>
                    <ChevronRight className="w-3 h-3" />
                    <span>{selectedModule.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">{selectedModule.name}</h1>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        v{selectedModule.version}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Atualizado em {selectedModule.lastUpdated}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sections */}
                <Accordion
                  type="multiple"
                  defaultValue={filteredSections.map(s => s.title)}
                  className="space-y-3"
                >
                  {filteredSections.map(section => (
                    <AccordionItem
                      key={section.title}
                      value={section.title}
                      className="border rounded-lg bg-card px-4"
                    >
                      <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                        {section.title}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <FormattedContent content={section.content} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {/* Changelog */}
                {selectedModule.changelog.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Histórico de Mudanças
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedModule.changelog.map(entry => (
                        <div key={entry.version} className="text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              v{entry.version}
                            </Badge>
                            <span className="text-muted-foreground">{entry.date}</span>
                          </div>
                          <ul className="list-disc list-inside text-muted-foreground ml-2">
                            {entry.changes.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center space-y-2">
                <BookOpen className="w-12 h-12 mx-auto opacity-30" />
                <p className="text-sm">Selecione um módulo para ver a documentação</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

/** Simple markdown-like renderer for doc content */
function FormattedContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {tableRows[0].map((cell, i) => (
                  <th key={i} className="text-left px-3 py-1.5 font-semibold text-foreground">
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(2).map((row, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-muted-foreground">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="bg-muted rounded-md p-3 text-xs overflow-x-auto my-2 font-mono whitespace-pre"
          >
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Table detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(Boolean);
      if (cells.every(c => /^[\s-:]+$/.test(c))) {
        // separator row
        tableRows.push(cells);
        inTable = true;
        continue;
      }
      tableRows.push(cells);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Render line with inline formatting
    elements.push(
      <p key={`p-${i}`} className="text-xs leading-relaxed text-muted-foreground">
        <InlineFormatted text={line} />
      </p>
    );
  }

  flushTable();

  return <>{elements}</>;
}

function InlineFormatted({ text }: { text: string }) {
  // Bold, inline code, and list items
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let key = 0;

  // List items
  if (remaining.startsWith('- ')) {
    remaining = remaining.slice(2);
    parts.push(<span key={key++} className="text-primary mr-1">•</span>);
  }

  // Process bold and inline code
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex));
  }

  return <>{parts}</>;
}
