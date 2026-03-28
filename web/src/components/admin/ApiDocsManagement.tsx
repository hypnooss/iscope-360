import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, Upload, FileText, Search, ChevronRight, Loader2, X, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { formatDateOnlyBR } from '@/lib/dateUtils';

interface ApiDoc {
  id: string;
  device_type_id: string;
  title: string;
  version: string;
  doc_type: string;
  content: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ParsedFile {
  name: string;
  content: any;
  detectedTitle: string;
  detectedType: string;
  endpointCount: number;
}

interface Props {
  deviceTypeId: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  log_api: 'Log API',
  rest_api: 'REST API',
  monitor_api: 'Monitor API',
  reference: 'Referência',
};

const FORTIOS_VERSIONS = [
  { value: '7.6', label: 'FortiOS 7.6' },
  { value: '7.4', label: 'FortiOS 7.4' },
  { value: '7.2', label: 'FortiOS 7.2' },
  { value: '7.0', label: 'FortiOS 7.0' },
  { value: '6.4', label: 'FortiOS 6.4' },
];

function buildDescriptiveTitle(content: any, fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.json$/i, '');
  if (nameWithoutExt) {
    const formatted = nameWithoutExt
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return formatted;
  }
  return content?.info?.title || fileName;
}

function detectDocType(content: any): string {
  const basePath = (content?.basePath || '').toLowerCase();
  const title = (content?.info?.title || '').toLowerCase();
  if (basePath.includes('/log/') || title.includes('log')) return 'log_api';
  if (basePath.includes('/monitor/') || title.includes('monitor')) return 'monitor_api';
  if (basePath.includes('/cmdb/') || title.includes('cmdb') || title.includes('rest')) return 'rest_api';
  return 'reference';
}

export function ApiDocsManagement({ deviceTypeId }: Props) {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [showViewer, setShowViewer] = useState<ApiDoc | null>(null);
  const [searchEndpoint, setSearchEndpoint] = useState('');

  // Batch upload state
  const [selectedVersion, setSelectedVersion] = useState('');
  const [customVersion, setCustomVersion] = useState('');
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseTotal, setParseTotal] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const effectiveVersion = selectedVersion === 'custom' ? customVersion : selectedVersion;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['api-docs', deviceTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_type_api_docs' as any)
        .select('*')
        .eq('device_type_id', deviceTypeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ApiDoc[];
    },
  });

  const insertMutation = useMutation({
    mutationFn: async (doc: { title: string; version: string; doc_type: string; content: any; notes: string | null }) => {
      const { error } = await supabase
        .from('device_type_api_docs' as any)
        .insert({
          device_type_id: deviceTypeId,
          title: doc.title,
          version: doc.version,
          doc_type: doc.doc_type,
          content: doc.content,
          notes: doc.notes || null,
        } as any);
      if (error) throw error;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('device_type_api_docs' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-docs', deviceTypeId] });
      queryClient.invalidateQueries({ queryKey: ['api-docs-count', deviceTypeId] });
      toast.success('Documento removido');
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const resetForm = () => {
    setShowUpload(false);
    setSelectedVersion('');
    setCustomVersion('');
    setParsedFiles([]);
    setNotes('');
    setUploadProgress(0);
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.onerror = () => reject(new Error(`Erro ao ler: ${file.name}`));
      reader.readAsText(file);
    });
  };

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    // Reset input so same files can be re-selected
    e.target.value = '';

    setParsing(true);
    setParseProgress(0);
    setParseTotal(fileArray.length);
    const newParsed: ParsedFile[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setParseProgress(i + 1);
      // Yield to UI so progress updates render
      await new Promise((r) => setTimeout(r, 0));
      try {
        const text = await readFileAsText(file);
        const parsed = JSON.parse(text);
        const detectedType = detectDocType(parsed);
        const detectedTitle = buildDescriptiveTitle(parsed, file.name);
        const endpointCount = parsed?.paths ? Object.keys(parsed.paths).length : 0;
        newParsed.push({ name: file.name, content: parsed, detectedTitle, detectedType, endpointCount });
      } catch {
        toast.error(`Arquivo inválido: ${file.name}`);
      }
    }

    setParsedFiles((prev) => [...prev, ...newParsed]);
    setParsing(false);
    setParseProgress(0);
    setParseTotal(0);
  };

  const removeFile = (index: number) => {
    setParsedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileType = (index: number, newType: string) => {
    setParsedFiles((prev) => prev.map((f, i) => i === index ? { ...f, detectedType: newType } : f));
  };

  const handleSubmitBatch = async () => {
    if (!effectiveVersion) {
      toast.error('Selecione a versão do FortiOS');
      return;
    }
    if (parsedFiles.length === 0) {
      toast.error('Selecione pelo menos um arquivo JSON');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    let successCount = 0;
    for (let idx = 0; idx < parsedFiles.length; idx++) {
      const file = parsedFiles[idx];
      setUploadProgress(idx + 1);
      try {
        await insertMutation.mutateAsync({
          title: file.detectedTitle,
          version: effectiveVersion,
          doc_type: file.detectedType,
          content: file.content,
          notes: notes || null,
        });
        successCount++;
      } catch (e: any) {
        toast.error(`Erro em ${file.name}: ${e.message}`);
      }
    }
    setUploading(false);
    setUploadProgress(0);

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['api-docs', deviceTypeId] });
      queryClient.invalidateQueries({ queryKey: ['api-docs-count', deviceTypeId] });
      toast.success(`${successCount} documento(s) adicionado(s) com sucesso`);
      resetForm();
    }
  };

  // Extract endpoints from swagger/openapi content
  const extractEndpoints = (content: any) => {
    if (!content?.paths) return [];
    return Object.entries(content.paths).flatMap(([path, methods]: [string, any]) =>
      Object.entries(methods).map(([method, details]: [string, any]) => ({
        path,
        method: method.toUpperCase(),
        summary: details.summary || details.description || '',
        parameters: details.parameters || [],
      }))
    );
  };

  const filteredEndpoints = showViewer
    ? extractEndpoints(showViewer.content).filter(
        (ep) =>
          !searchEndpoint ||
          ep.path.toLowerCase().includes(searchEndpoint.toLowerCase()) ||
          ep.summary.toLowerCase().includes(searchEndpoint.toLowerCase())
      )
    : [];

  const methodColor = (m: string) => {
    switch (m) {
      case 'GET': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'POST': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'PUT': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'DELETE': return 'bg-red-500/15 text-red-400 border-red-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const totalEndpoints = parsedFiles.reduce((sum, f) => sum + f.endpointCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Documentação API</h3>
          <p className="text-sm text-muted-foreground">
            Schemas e referências de API associados a este template
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Documentos
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Nenhuma documentação API cadastrada</p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowUpload(true)}>
            <Upload className="w-4 h-4" />
            Enviar documentos
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Endpoints</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => {
              const endpointCount = doc.content?.paths
                ? Object.keys(doc.content.paths).length
                : 0;
              return (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{doc.version}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{endpointCount} paths</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateOnlyBR(doc.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setShowViewer(doc); setSearchEndpoint(''); }}
                        title="Visualizar"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Remover este documento?')) deleteMutation.mutate(doc.id);
                        }}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Batch Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={(o) => !o && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Documentação API</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Version selector */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Versão FortiOS *</Label>
                <Select value={selectedVersion} onValueChange={(v) => { setSelectedVersion(v); if (v !== 'custom') setCustomVersion(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a versão" /></SelectTrigger>
                  <SelectContent>
                    {FORTIOS_VERSIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                    <SelectItem value="custom">Outra versão...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedVersion === 'custom' ? (
                <div className="space-y-2">
                  <Label>Versão específica *</Label>
                  <Input value={customVersion} onChange={(e) => setCustomVersion(e.target.value)} placeholder="Ex: 6.2.15" />
                </div>
              ) : selectedVersion ? (
                <div className="space-y-2">
                  <Label>Versão específica (opcional)</Label>
                  <Input
                    value={customVersion}
                    onChange={(e) => setCustomVersion(e.target.value)}
                    placeholder={`Ex: ${selectedVersion}.11`}
                  />
                  {customVersion && (
                    <p className="text-xs text-muted-foreground">Será salvo como: {customVersion}</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* File input */}
            <div className="space-y-2">
              <Label>Arquivos JSON (Swagger/OpenAPI)</Label>
              <Input type="file" accept=".json" multiple onChange={handleFilesChange} disabled={uploading} />
              {parsing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando {parseProgress} de {parseTotal} arquivos...
                </div>
              )}
            </div>

            {/* Files preview */}
            {parsedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{parsedFiles.length} arquivo(s) • {totalEndpoints} endpoints</Label>
                  <Button variant="ghost" size="sm" onClick={() => setParsedFiles([])} className="text-xs text-muted-foreground h-7" disabled={uploading}>
                    Limpar todos
                  </Button>
                </div>
                {uploading && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Enviando {uploadProgress} de {parsedFiles.length}...</span>
                      <span>{Math.round((uploadProgress / parsedFiles.length) * 100)}%</span>
                    </div>
                    <Progress value={(uploadProgress / parsedFiles.length) * 100} className="h-2" />
                  </div>
                )}
                <ScrollArea className="h-[300px] overflow-hidden">
                  <div className="space-y-1.5 pr-2">
                    {parsedFiles.map((file, i) => {
                      const isUploaded = uploading && i < uploadProgress;
                      const isCurrently = uploading && i === uploadProgress - 1 && uploadProgress <= parsedFiles.length;
                      const isPending = !uploading || i >= uploadProgress;
                      return (
                        <div key={`${file.name}-${i}`} className={`flex items-center gap-2 p-2.5 rounded-lg border border-border/50 ${isUploaded ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/30'}`}>
                          {isUploaded ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : isCurrently ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.detectedTitle}</p>
                            <p className="text-xs text-muted-foreground">{file.name} • {file.endpointCount} endpoints</p>
                          </div>
                          <Select value={file.detectedType} onValueChange={(v) => updateFileType(i, v)} disabled={uploading}>
                            <SelectTrigger className="w-[130px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile(i)} disabled={uploading}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas aplicadas a todos os documentos do lote..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSubmitBatch} disabled={uploading || !effectiveVersion || parsedFiles.length === 0} className="gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? `Enviando ${uploadProgress} de ${parsedFiles.length}...` : `Enviar ${parsedFiles.length > 0 ? `(${parsedFiles.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Viewer Dialog */}
      <Dialog open={!!showViewer} onOpenChange={(o) => !o && setShowViewer(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <FileText className="w-5 h-5" />
              {showViewer?.title}
              <Badge variant="outline">{showViewer?.version}</Badge>
            </DialogTitle>
          </DialogHeader>
          {showViewer?.notes && (
            <p className="text-sm text-muted-foreground border-l-2 border-primary/30 pl-3">{showViewer.notes}</p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchEndpoint}
              onChange={(e) => setSearchEndpoint(e.target.value)}
              placeholder="Buscar endpoint..."
              className="pl-9"
            />
          </div>
          <ScrollArea className="flex-1 min-h-0 max-h-[55vh]">
            <div className="space-y-1 pr-4">
              {filteredEndpoints.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Nenhum endpoint encontrado</p>
              ) : (
                filteredEndpoints.map((ep, i) => (
                  <div
                    key={`${ep.path}-${ep.method}-${i}`}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <Badge variant="outline" className={`font-mono text-xs min-w-[60px] justify-center ${methodColor(ep.method)}`}>
                      {ep.method}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-mono text-foreground break-all">{ep.path}</code>
                      {ep.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ep.summary}</p>
                      )}
                      {ep.parameters.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {ep.parameters.length} parâmetro(s): {ep.parameters.map((p: any) => p.name).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="text-xs text-muted-foreground text-right pt-2 border-t border-border/50">
            {filteredEndpoints.length} endpoint(s) {searchEndpoint && 'filtrado(s)'}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
