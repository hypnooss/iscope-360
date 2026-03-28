import React, { useEffect, useRef, useState } from 'react';
import { MiniChart } from '@/features/landing/components/MiniChart';
import { SteppedShowcase } from '@/features/landing/components/SteppedShowcase';
import { ScrollDownIndicator } from '@/features/landing/components/ScrollDownIndicator';
import { useNavigate } from 'react-router-dom';
//import { useAuth } from '@/features/auth/context/AuthContext';
import { Header } from '@/features/landing/components/Header';
import { Footer } from '@/features/landing/components/Footer';
import { NetworkAnimation } from '@/features/landing/components/NetworkAnimation';
import { Button } from '@/components/ui/button';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import {
    ArrowRight, Shield, Network, Eye, Zap,
    Quote, Scan, BarChart3, FileSearch, ShieldCheck,
    AlertTriangle, Clock, Layers, BookOpen, CheckCircle2, Lock,
    BellOff, SlidersHorizontal, Puzzle, Calendar, Tag,
    Cloud, Server, Globe, Cpu,
} from 'lucide-react';

/* ── Animation Variants (hero / CTA only) ── */
const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
    hidden: { opacity: 0, y: 60 },
    visible: { opacity: 1, y: 0 },
};

const fadeUpScale = {
    hidden: { opacity: 0, y: 80, scale: 0.92 },
    visible: { opacity: 1, y: 0, scale: 1 },
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } },
};

/* ── Section — plain <section>, no stacking-context isolation ── */
function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
    return (
        <section
            id={id}
            data-section
            className={`py-[160px] px-6 overflow-hidden relative ${className}`}
        >
            <div className="max-w-[1200px] mx-auto w-full">
                {children}
            </div>
        </section>
    );
}

/* ── Reveal — Smooth spring-like reveal matching Maze HQ aesthetics ── */
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, amount: 0.15 });
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (isInView && !done) {
            const t = setTimeout(() => setDone(true), 1200 + delay * 1000);
            return () => clearTimeout(t);
        }
    }, [isInView, done, delay]);

    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: isInView ? 1 : 0,
                transform: done ? undefined : isInView ? 'translateY(0px) scale(1)' : 'translateY(45px) scale(0.97)',
                transition: `opacity 1.0s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 1.0s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
            }}
        >
            {children}
        </div>
    );
}

/* ── Page ── */
const Index = () => {
    // const { user, loading, mfaRequired, mfaEnrolled } = useAuth();
    const user = null;
    const loading = false;
    const mfaRequired = false;
    const mfaEnrolled = false;

    const navigate = useNavigate();
    const { scrollY } = useScroll();

    // Mantém o terreno de dados visível por toda a página, apenas caindo bem suave lá no final
    const canvasOpacity = useTransform(scrollY, [0, 4000], [1, 0.4]);

    useEffect(() => {
        if (!loading && user) {
            if (mfaRequired) {
                navigate(mfaEnrolled ? '/mfa/challenge' : '/mfa/enroll');
            } else {
                navigate('/dashboard');
            }
        }
    }, [user, loading, navigate, mfaRequired, mfaEnrolled]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen text-foreground flex flex-col relative">
            <Header />

            <motion.div style={{ opacity: canvasOpacity }} className="fixed inset-0 z-0 pointer-events-none origin-center">
                <NetworkAnimation className="w-full h-full" />
            </motion.div>

            <main className="flex-1 relative">
                <section id="hero" data-section className="h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                        className="relative z-10 text-center max-w-[960px] mx-auto"
                    >
                        <Reveal delay={0.1}>
                            <h1 className="font-heading text-[2.8rem] sm:text-[3.8rem] lg:text-[5.2rem] font-extrabold leading-[0.95] tracking-[-0.035em] mb-6 text-foreground">
                                Visibilidade inteligente{' '}
                                <span className="block text-primary">para sua infraestrutura</span>
                            </h1>
                        </Reveal>
                        <Reveal delay={0.25}>
                            <p className="text-[1rem] sm:text-[1.15rem] text-foreground/80 max-w-[620px] mx-auto mb-10 leading-relaxed">
                                Plataforma completa para análise de compliance, segurança e
                                boas práticas da sua infraestrutura.
                            </p>
                        </Reveal>
                        <Reveal delay={0.35}>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Button size="lg" className="gap-2 text-base px-8" onClick={() => navigate('/auth')}>
                                    Acessar Plataforma <ArrowRight className="w-4 h-4" />
                                </Button>
                                <Button size="lg" variant="outline" className="gap-2 text-base px-8" onClick={() => document.getElementById('problem')?.scrollIntoView({ behavior: 'smooth' })}>
                                    Ver como funciona
                                </Button>
                            </div>
                        </Reveal>
                    </motion.div>
                </section>

                <Section id="problem">
                    <Reveal>
                        <div className="text-center mb-20">
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-6 leading-tight">
                                A superfície de ataque{' '}
                                <span className="text-primary">nunca foi tão grande</span>
                            </h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                                Em 2025, o volume de vulnerabilidades e a velocidade de exploração atingiram níveis sem precedentes.
                            </p>
                        </div>
                    </Reveal>

                    <div id="problem-cards-start" aria-hidden="true" className="h-0" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
                        <Reveal delay={0}>
                            <div className="feature-card p-6 text-center md:text-left h-full">
                                <div className="text-5xl lg:text-6xl font-heading font-extrabold text-foreground mb-3 tracking-tight">21,500+</div>
                                <div className="text-lg font-semibold text-foreground/90 mb-1">CVEs no 1º semestre de 2025</div>
                                <div className="text-sm text-muted-foreground">Projeção de 45.000+ no ano — recorde absoluto</div>
                                <MiniChart
                                    type="bar"
                                    color="hsl(var(--primary))"
                                    data={[
                                        { label: '2018', value: 16510 },
                                        { label: '2019', value: 17306 },
                                        { label: '2020', value: 18325 },
                                        { label: '2021', value: 20155 },
                                        { label: '2022', value: 25059 },
                                        { label: '2023', value: 28902 },
                                        { label: '2024', value: 40009 },
                                        { label: '2025', value: 45000 },
                                    ]}
                                />
                            </div>
                        </Reveal>

                        <Reveal delay={0.15}>
                            <div className="feature-card p-6 text-center md:text-left h-full">
                                <div className="text-5xl lg:text-6xl font-heading font-extrabold text-foreground mb-3 tracking-tight">5 dias</div>
                                <div className="text-lg font-semibold text-foreground/90 mb-1">Tempo médio para exploração</div>
                                <div className="text-sm text-muted-foreground">Colapsou de 63 dias em 2019 para 5 em 2023</div>
                                <MiniChart
                                    type="line"
                                    color="hsl(var(--destructive))"
                                    data={[
                                        { label: '2019', value: 63 },
                                        { label: '2020', value: 44 },
                                        { label: '2021', value: 32 },
                                        { label: '2022', value: 19 },
                                        { label: '2023', value: 5 },
                                    ]}
                                />
                            </div>
                        </Reveal>

                        <Reveal delay={0.3}>
                            <div className="feature-card p-6 text-center md:text-left h-full">
                                <div className="text-5xl lg:text-6xl font-heading font-extrabold text-foreground mb-3 tracking-tight">$4.88M</div>
                                <div className="text-lg font-semibold text-foreground/90 mb-1">Custo médio de um data breach</div>
                                <div className="text-sm text-muted-foreground">IBM Cost of a Data Breach Report 2024</div>
                                <MiniChart
                                    type="line"
                                    color="hsl(var(--warning))"
                                    data={[
                                        { label: '2020', value: 3.86 },
                                        { label: '2021', value: 4.24 },
                                        { label: '2022', value: 4.35 },
                                        { label: '2023', value: 4.45 },
                                        { label: '2024', value: 4.88 },
                                    ]}
                                />
                            </div>
                        </Reveal>
                    </div>
                </Section>

                <Section id="real-problem">
                    <Reveal>
                        <div className="text-center mb-4">
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-4 leading-tight">
                                <span className="text-primary">90%</span> dos alertas são falsos positivos
                            </h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
                                Ferramentas tradicionais inundam sua equipe com milhares de alertas sem contexto.
                                O resultado? Fadiga de alertas, priorização errada e riscos reais ignorados.
                            </p>
                        </div>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
                        {[
                            {
                                icon: BellOff, title: 'Alertas sem contexto',
                                description: 'Scanners reportam vulnerabilidades sem considerar sua infraestrutura, ambiente ou controles compensatórios.',
                                stat: '25h/semana', statLabel: 'gastas em triagem manual',
                            },
                            {
                                icon: SlidersHorizontal, title: 'Priorização manual',
                                description: 'Sem automação, equipes dependem de planilhas e intuição para decidir o que corrigir primeiro.',
                                stat: '68%', statLabel: 'das equipes não conseguem priorizar',
                            },
                            {
                                icon: Puzzle, title: 'Ferramentas fragmentadas',
                                description: 'Firewalls, cloud, endpoints — cada um com seu painel. Nenhuma visão unificada do risco real.',
                                stat: '6+', statLabel: 'ferramentas por equipe em média',
                            },
                        ].map((item, i) => (
                            <Reveal key={item.title} delay={i * 0.12}>
                                <div className="feature-card p-8 h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300">
                                    <div className="inline-flex p-3 rounded-xl bg-destructive/10 mb-5 self-start group-hover:bg-destructive/15 transition-colors duration-300">
                                        <item.icon className="w-5 h-5 text-destructive" />
                                    </div>
                                    <h3 className="font-heading font-bold text-lg text-foreground mb-3">{item.title}</h3>
                                    <p className="text-[15px] text-muted-foreground leading-relaxed flex-1 mb-6">{item.description}</p>
                                    <div className="border-t border-border/20 pt-4">
                                        <div className="text-2xl font-heading font-extrabold text-foreground">{item.stat}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">{item.statLabel}</div>
                                    </div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Section>

                <Section id="how-it-works">
                    <Reveal>
                        <div className="text-center mb-20">
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-4">
                                Como o iScope <span className="text-primary">resolve</span>
                            </h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                                Da conexão à ação — em quatro passos simples.
                            </p>
                        </div>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                        <div className="hidden md:block absolute top-16 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                        {[
                            { num: '01', icon: Network, title: 'Conecte', desc: 'Integre firewalls, servidores e serviços de nuvem em minutos.' },
                            { num: '02', icon: Scan, title: 'Analise', desc: 'Nossa engine avalia centenas de pontos de compliance e segurança.' },
                            { num: '03', icon: BarChart3, title: 'Visualize', desc: 'Dashboards interativos com visão 360° do seu ambiente.' },
                            { num: '04', icon: ShieldCheck, title: 'Corrija', desc: 'Recomendações acionáveis para melhorar sua postura de segurança.' },
                        ].map((step, i) => (
                            <Reveal key={step.num} delay={i * 0.12}>
                                <div className="text-center feature-card p-6">
                                    <div className="inline-flex items-center justify-center w-[4.5rem] h-[4.5rem] rounded-2xl bg-card/60 backdrop-blur-xl border border-border/30 mb-6 relative z-10 shadow-lg shadow-background/50">
                                        <step.icon className="w-6 h-6 text-primary" />
                                    </div>
                                    <div className="text-xs font-mono text-primary/60 mb-2 tracking-wider">{step.num}</div>
                                    <h3 className="font-heading font-bold text-lg text-foreground mb-2">{step.title}</h3>
                                    <p className="text-sm text-muted-foreground max-w-[220px] mx-auto leading-relaxed">{step.desc}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Section>

                <Section id="features">
                    <Reveal>
                        <div className="text-center mb-16">
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-4">
                                Tudo que você precisa em <span className="text-primary">um só lugar</span>
                            </h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                                Ferramentas poderosas para manter sua infraestrutura segura e em conformidade.
                            </p>
                        </div>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { icon: FileSearch, title: 'Análise de Compliance', description: 'Mais de 50 pontos de verificação baseados em boas práticas de mercado e frameworks reconhecidos.', highlight: '50+ verificações' },
                            { icon: Shield, title: 'Detecção de Riscos', description: 'Identifica vulnerabilidades e configurações inseguras automaticamente em toda a sua infraestrutura.', highlight: 'Tempo real' },
                            { icon: Eye, title: 'Visibilidade Total', description: 'Dashboards unificados com visão 360° do ambiente — firewalls, cloud, endpoints e serviços.', highlight: 'Visão 360°' },
                        ].map((f, i) => (
                            <Reveal key={f.title} delay={i * 0.1}>
                                <div className="feature-card group h-full flex flex-col">
                                    <div className="inline-flex p-3.5 rounded-xl bg-primary/10 mb-5 group-hover:bg-primary/15 transition-colors duration-300 self-start">
                                        <f.icon className="w-6 h-6 text-primary" />
                                    </div>
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-primary/60 font-mono mb-3">{f.highlight}</div>
                                    <h3 className="font-heading font-bold text-xl text-foreground mb-3">{f.title}</h3>
                                    <p className="text-[15px] text-muted-foreground leading-relaxed flex-1">{f.description}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Section>

                <SteppedShowcase />

                <Section id="testimonials">
                    <Reveal>
                        <div className="text-center mb-16">
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-4">
                                O que nossos <span className="text-primary">clientes</span> dizem
                            </h2>
                            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
                                Empresas de diferentes setores confiam no iScope para proteger sua operação.
                            </p>
                        </div>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { quote: 'Reduzimos nosso tempo de auditoria de compliance em 65%. O que levava uma semana agora é feito em um dia com o iScope.', name: 'Carlos M.', role: 'CISO', company: 'Empresa de Tecnologia — 2.000+ funcionários' },
                            { quote: 'Pela primeira vez temos visibilidade real do nosso ambiente multi-cloud. Antes eram 6 ferramentas e nenhuma visão unificada.', name: 'Ana L.', role: 'CTO', company: 'Fintech — Série B' },
                            { quote: 'A detecção automática de configurações inseguras nos evitou dois incidentes críticos em seis meses. O ROI se pagou no primeiro trimestre.', name: 'Roberto S.', role: 'Diretor de Infraestrutura', company: 'Healthcare — 50+ unidades' },
                        ].map((t, i) => (
                            <Reveal key={t.name} delay={i * 0.12}>
                                <div className="feature-card p-8 h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300">
                                    <Quote className="w-8 h-8 text-primary/20 mb-4 shrink-0" />
                                    <p className="text-[15px] text-foreground/80 leading-relaxed mb-8 flex-1 italic">
                                        "{t.quote}"
                                    </p>
                                    <div className="border-t border-border/20 pt-5">
                                        <div className="font-heading font-bold text-foreground text-sm">{t.name}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">{t.role}</div>
                                        <div className="text-xs text-muted-foreground/60 mt-0.5">{t.company}</div>
                                    </div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Section>

                <Section id="blog">
                    <Reveal>
                        <div className="text-center mb-16">
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-4">
                                Insights de <span className="text-primary">segurança</span>
                            </h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                                Análises e perspectivas sobre o cenário atual de cibersegurança e compliance.
                            </p>
                        </div>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { category: 'Security', date: 'Mar 2025', title: '2025: O ano que vulnerabilidades quebraram todos os recordes', excerpt: 'Com 21.500+ CVEs só no primeiro semestre, entenda por que a abordagem tradicional de patch management não escala mais.' },
                            { category: 'Product', date: 'Fev 2025', title: 'Por que CVSS sozinho não é suficiente para priorizar vulnerabilidades', excerpt: 'Contexto de negócio, exposição e controles compensatórios: os fatores que o CVSS ignora na priorização de riscos.' },
                            { category: 'Compliance', date: 'Jan 2025', title: 'Compliance não é segurança: por que checklist não funciona', excerpt: 'A diferença entre estar em conformidade no papel e ter uma postura de segurança efetiva contra ameaças reais.' },
                        ].map((post, i) => (
                            <Reveal key={post.title} delay={i * 0.12}>
                                <div className="feature-card p-8 h-full flex flex-col group cursor-pointer hover:border-primary/30 hover:-translate-y-1 transition-all duration-300">
                                    <div className="flex items-center gap-3 mb-5">
                                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono text-primary/70">
                                            <Tag className="w-3 h-3" />
                                            {post.category}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/50 font-mono flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {post.date}
                                        </span>
                                    </div>
                                    <h3 className="font-heading font-bold text-lg text-foreground mb-3 group-hover:text-primary transition-colors duration-300 leading-snug">
                                        {post.title}
                                    </h3>
                                    <p className="text-[14px] text-muted-foreground leading-relaxed flex-1 mb-5">
                                        {post.excerpt}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-primary/70 group-hover:text-primary transition-colors duration-300">
                                        Ler artigo <ArrowRight className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Section>

                <section id="cta" data-section className="py-[160px] px-6 relative overflow-hidden bg-transparent">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.4 }}
                        variants={stagger}
                        className="max-w-3xl mx-auto w-full text-center relative z-10"
                    >
                        <Reveal>
                            <h2 className="font-heading text-3xl lg:text-[2.5rem] font-bold mb-4 leading-tight">
                                Comece a proteger sua infraestrutura{' '}
                                <span className="text-primary">hoje</span>
                            </h2>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-muted-foreground max-w-xl mx-auto mb-10 text-lg leading-relaxed">
                                Descubra vulnerabilidades, melhore sua postura de segurança e mantenha compliance contínuo.
                            </p>
                        </Reveal>
                        <Reveal delay={0.2}>
                            <Button
                                size="lg"
                                variant="outline"
                                onClick={() => navigate('/auth')}
                                className="gap-2 px-10 h-14 text-base font-semibold hover:-translate-y-0.5 transition-all duration-300"
                            >
                                Falar com especialista <ArrowRight className="w-5 h-5" />
                            </Button>
                        </Reveal>
                    </motion.div>
                </section>
            </main>

            <ScrollDownIndicator />

            <Footer />
        </div>
    );
};

export default Index;
