import { useRef } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useState } from 'react';
import { CheckCircle2, Search, Brain, Zap, Shield, Ticket, Bell, AlertTriangle } from 'lucide-react';

/* ── Step data ── */
const steps = [
  {
    num: '01',
    badge: 'Identificação',
    icon: Search,
    title: 'Identifique as vulnerabilidades\nque realmente importam',
    description:
      'Identifique as poucas vulnerabilidades verdadeiramente críticas, para que você pare de se preocupar com uma vulnerabilidade não corrigida levando a um breach.',
  },
  {
    num: '02',
    badge: 'Priorização',
    icon: Brain,
    title: 'Priorize com inteligência\ncontextual',
    description:
      'Correlacione dados de firewalls, cloud e endpoints para priorizar com base no risco real — não apenas no CVSS score.',
  },
  {
    num: '03',
    badge: 'Remediação',
    icon: Zap,
    title: 'Responda rápido e pare\nde gerenciar remediação',
    description:
      'Use workflows inteligentes para preparar mitigações imediatas para vulnerabilidades críticas, com opções de remediação em um clique.',
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Real CVE data ── */
const realCVEs = [
  {
    id: 'CVE-2024-3094',
    product: 'XZ Utils',
    score: 10.0,
    severity: 'Critical',
    tags: ['RCE', 'Supply Chain', 'In the Wild'],
  },
  {
    id: 'CVE-2024-21762',
    product: 'FortiOS SSL-VPN',
    score: 9.8,
    severity: 'Critical',
    tags: ['Out-of-bounds Write', 'Exploitable'],
  },
  {
    id: 'CVE-2021-44228',
    product: 'Apache Log4j',
    score: 10.0,
    severity: 'Critical',
    tags: ['RCE', 'In the Wild', 'CISA KEV'],
  },
];

/* ── Enhanced CVE Card ── */
function CVECard({
  cve,
  opacity,
  delay = 0,
}: {
  cve: typeof realCVEs[0];
  opacity: number;
  delay?: number;
}) {
  return (
    <motion.div
      className="rounded-xl w-full border border-destructive/15 bg-card/80 backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, x: 40, scale: 0.92 }}
      animate={{
        opacity: opacity > 0.3 ? 1 : 0,
        x: opacity > 0.3 ? 0 : 40,
        scale: opacity > 0.3 ? 1 : 0.92,
      }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-destructive/30 bg-destructive/10 flex items-center justify-center shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
          </div>
          <div>
            <span className="font-mono text-base font-bold text-foreground tracking-tight">{cve.id}</span>
            <div className="text-sm text-muted-foreground mt-0.5">{cve.product}</div>
          </div>
        </div>
        <div className="flex items-center justify-center w-12 h-8 rounded-lg bg-destructive/15 border border-destructive/30">
          <span className="font-mono text-sm font-bold text-destructive">{cve.score.toFixed(1)}</span>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 px-5 pb-4 pt-1">
        {cve.tags.map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-1 rounded-md text-xs font-mono tracking-wide text-destructive border border-destructive/20 bg-destructive/5"
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Sankey/Alluvial Risk Chart (step 2 visual) ── */
function RiskChart({ opacity }: { opacity: number }) {
  const W = 440;
  const H = 300;
  const nodeW = 8;
  const gap = 4;

  const sources = [
    { label: 'Critical', total: 89186, exploitable: 8420, color: 'hsl(0, 85%, 55%)' },
    { label: 'High', total: 100455, exploitable: 4210, color: 'hsl(25, 95%, 53%)' },
    { label: 'Medium', total: 149156, exploitable: 1890, color: 'hsl(45, 93%, 47%)' },
    { label: 'Low', total: 380431, exploitable: 320, color: 'hsl(210, 80%, 55%)' },
  ];

  const destColors = {
    exploitable: 'hsl(0, 85%, 55%)',
    notExploitable: 'hsl(142, 71%, 45%)',
  };

  const grandTotal = sources.reduce((s, r) => s + r.total, 0);
  const totalExploitable = sources.reduce((s, r) => s + r.exploitable, 0);
  const totalNotExploitable = grandTotal - totalExploitable;

  const padTop = 20;
  const usableH = H - padTop - 20;

  // Left node positions — heights proportional without gaps
  const leftX = 90;
  let leftY = padTop;
  const leftNodes = sources.map((s) => {
    const h = Math.max((s.total / grandTotal) * usableH, 24);
    const node = { ...s, x: leftX, y: leftY, h };
    leftY += h + gap;
    return node;
  });

  // Right nodes span exactly from top of first left node to bottom of last left node
  const lastLeft = leftNodes[leftNodes.length - 1];
  const rightSpan = lastLeft.y + lastLeft.h - padTop; // total visual span including gaps
  const rightX = W - 90;
  const exploitH = Math.max((totalExploitable / grandTotal) * rightSpan, 28);
  const notExploitH = rightSpan - exploitH;
  const rightNodes = [
    { label: 'Exploitable', value: totalExploitable, pct: '2.1%', y: padTop, h: exploitH, color: destColors.exploitable },
    { label: 'Not Exploitable', value: totalNotExploitable, pct: '97.9%', y: padTop + exploitH + 4, h: notExploitH - 4, color: destColors.notExploitable },
  ];

  // Build flow paths — flows taper: left height proportional to source, right height proportional to destination
  let exploitYAccumLeft: number[] = [];
  let notExploitYAccumLeft: number[] = [];

  // Pre-calculate left-side Y positions for each flow
  let eLY = 0; // tracks exploit flow offset within each source
  leftNodes.forEach((src) => {
    const exploitFlowH = (src.exploitable / src.total) * src.h;
    exploitYAccumLeft.push(src.y);
    notExploitYAccumLeft.push(src.y + exploitFlowH);
  });

  // Right-side: each flow's height is proportional to its share of the destination node
  let exploitYRight = rightNodes[0].y;
  let notExploitYRight = rightNodes[1].y;

  const flows: { d: string; gradId: string; srcColor: string; dstColor: string; delay: number }[] = [];

  leftNodes.forEach((src, i) => {
    const exploitFlowHL = (src.exploitable / src.total) * src.h; // height at left
    const notExploitFlowHL = src.h - exploitFlowHL; // height at left

    const exploitFlowHR = (src.exploitable / totalExploitable) * rightNodes[0].h; // height at right
    const notExploitFlowHR = ((src.total - src.exploitable) / totalNotExploitable) * rightNodes[1].h; // height at right

    const x1 = src.x + nodeW;
    const x2 = rightX;
    const cx = (x1 + x2) / 2;

    // Exploitable flow (tapered)
    if (exploitFlowHL > 0.2) {
      const syTop = exploitYAccumLeft[i];
      const syBot = syTop + exploitFlowHL;
      const eyTop = exploitYRight;
      const eyBot = eyTop + exploitFlowHR;
      const d = `M${x1},${syTop} C${cx},${syTop} ${cx},${eyTop} ${x2},${eyTop} L${x2},${eyBot} C${cx},${eyBot} ${cx},${syBot} ${x1},${syBot} Z`;
      flows.push({ d, gradId: `grad-e-${i}`, srcColor: src.color, dstColor: destColors.exploitable, delay: i * 0.12 });
      exploitYRight += exploitFlowHR;
    }

    // Not exploitable flow (tapered)
    {
      const syTop = notExploitYAccumLeft[i];
      const syBot = syTop + notExploitFlowHL;
      const eyTop = notExploitYRight;
      const eyBot = eyTop + notExploitFlowHR;
      const d = `M${x1},${syTop} C${cx},${syTop} ${cx},${eyTop} ${x2},${eyTop} L${x2},${eyBot} C${cx},${eyBot} ${cx},${syBot} ${x1},${syBot} Z`;
      flows.push({ d, gradId: `grad-n-${i}`, srcColor: src.color, dstColor: destColors.notExploitable, delay: i * 0.12 + 0.05 });
      notExploitYRight += notExploitFlowHR;
    }
  });

  const isVisible = opacity > 0.3;

  return (
    <motion.div
      className="glass-container rounded-2xl p-5 w-full max-w-[480px] ml-auto"
      style={{ opacity }}
      initial={{ x: 60, scale: 0.95 }}
      animate={{ x: isVisible ? 0 : 60, scale: isVisible ? 1 : 0.95 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider">Risk Distribution</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <defs>
          {flows.map((f) => (
            <linearGradient key={f.gradId} id={f.gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={f.srcColor} />
              <stop offset="100%" stopColor={f.dstColor} />
            </linearGradient>
          ))}
        </defs>

        {/* Flow paths with gradients */}
        {flows.map((f, i) => (
          <motion.path
            key={i}
            d={f.d}
            fill={`url(#${f.gradId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: isVisible ? 0.35 : 0 }}
            transition={{ duration: 0.8, delay: f.delay, ease: EASE }}
          />
        ))}

        {/* Left nodes (severity bars) */}
        {leftNodes.map((n, i) => (
          <g key={n.label}>
            <motion.rect
              x={n.x}
              y={n.y}
              width={nodeW}
              height={n.h}
              rx={2}
              fill={n.color}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: isVisible ? 1 : 0 }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: EASE }}
              style={{ transformOrigin: `${n.x + nodeW / 2}px ${n.y}px` }}
            />
            <motion.text
              x={n.x - 8}
              y={n.y + n.h / 2 - 1}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-foreground/80"
              fontSize="11"
              fontWeight="600"
              fontFamily="var(--font-sans)"
              initial={{ opacity: 0 }}
              animate={{ opacity: isVisible ? 1 : 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
            >
              {n.label}
            </motion.text>
            <motion.text
              x={n.x - 8}
              y={n.y + n.h / 2 + 13}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-muted-foreground/50"
              fontSize="8"
              fontFamily="var(--font-mono, monospace)"
              initial={{ opacity: 0 }}
              animate={{ opacity: isVisible ? 1 : 0 }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
            >
              {n.total.toLocaleString()}
            </motion.text>
          </g>
        ))}

        {/* Right nodes (exploitable / not exploitable) */}
        {rightNodes.map((n, i) => (
          <g key={n.label}>
            <motion.rect
              x={rightX}
              y={n.y}
              width={nodeW}
              height={n.h}
              rx={2}
              fill={n.color}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: isVisible ? 1 : 0 }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.15, ease: EASE }}
              style={{ transformOrigin: `${rightX + nodeW / 2}px ${n.y}px` }}
            />
            <motion.text
              x={rightX + nodeW + 8}
              y={n.y + n.h / 2}
              textAnchor="start"
              dominantBaseline="central"
              className="fill-foreground/80"
              fontSize="11"
              fontWeight="600"
              fontFamily="var(--font-sans)"
              initial={{ opacity: 0 }}
              animate={{ opacity: isVisible ? 1 : 0 }}
              transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
            >
              {n.label === 'Not Exploitable' ? (
                <>
                  <tspan x={rightX + nodeW + 8} dy="-0.6em">Not</tspan>
                  <tspan x={rightX + nodeW + 8} dy="1.2em">Exploitable</tspan>
                </>
              ) : n.label}
            </motion.text>
            <motion.text
              x={rightX + nodeW + 8}
              y={n.y + n.h / 2 + 13}
              textAnchor="start"
              dominantBaseline="central"
              className="fill-muted-foreground/50"
              fontSize="8"
              fontFamily="var(--font-mono, monospace)"
              initial={{ opacity: 0 }}
              animate={{ opacity: isVisible ? 1 : 0 }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
            >
              {n.pct}
            </motion.text>
          </g>
        ))}
      </svg>

      <div className="mt-2 pt-2 border-t border-muted/20 flex justify-between text-[11px] font-mono text-muted-foreground/70">
        <span>Total: {grandTotal.toLocaleString()} CVEs</span>
        <span>Exploitable: {totalExploitable.toLocaleString()} ({((totalExploitable / grandTotal) * 100).toFixed(1)}%)</span>
      </div>
    </motion.div>
  );
}

/* ── Enhanced Workflow Step ── */
const workflowSteps = [
  { num: '01', label: 'Incidente criado automaticamente', icon: AlertTriangle, time: 'agora' },
  { num: '02', label: 'Regra WAF implantada no FortiGate', icon: Shield, time: 'há 2 min' },
  { num: '03', label: 'Ticket criado no ServiceNow', icon: Ticket, time: 'há 3 min' },
];

function WorkflowStepCard({
  step,
  visible,
  delay = 0,
}: {
  step: typeof workflowSteps[0];
  visible: boolean;
  delay?: number;
}) {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 30, scale: visible ? 1 : 0.9 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className="glass-container px-5 py-4 rounded-xl flex items-center gap-4"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1">
        <span className="text-sm text-foreground/80">{step.label}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground/50">{step.time}</span>
        <CheckCircle2 className="w-4 h-4 text-primary" />
      </div>
    </motion.div>
  );
}

/* ── Progress Bar ── */
function ProgressBar({ scrollProgress }: { scrollProgress: number }) {
  const totalProgress = Math.min(scrollProgress * 1.1, 1);

  return (
    <div className="sticky top-[72px] z-30 pt-8 pb-4 bg-gradient-to-b from-background via-background/95 to-transparent">
      <div className="flex items-start justify-center w-full max-w-[900px] mx-auto px-6">
        {steps.map((s, i) => {
          const stepStart = i / 3;
          const isActive = totalProgress >= stepStart;
          const isPast = totalProgress >= (i + 1) / 3;
          const Icon = s.icon;

          return (
            <div key={s.num} className="flex items-start flex-1">
              <div className="flex flex-col items-center gap-2 min-w-[80px]">
                <motion.div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${isActive
                      ? 'border-primary bg-primary/10 shadow-md shadow-primary/20'
                      : 'border-muted-foreground/20 bg-card'
                    }`}
                  animate={{ scale: isActive ? 1 : 0.85 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  <Icon className={`w-4 h-4 transition-colors duration-500 ${isActive ? 'text-primary' : 'text-muted-foreground/30'}`} />
                </motion.div>
                <div className="text-center">
                  <div className={`font-mono text-[11px] transition-colors duration-500 ${isActive ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                    {s.num}
                  </div>
                  <div className={`text-[10px] transition-colors duration-500 ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/20'}`}>
                    {s.badge}
                  </div>
                </div>
              </div>

              {i < steps.length - 1 && (
                <div className="flex-1 mt-5 mx-2">
                  <div className="h-[2px] rounded-full bg-muted-foreground/10 relative overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.3))',
                      }}
                      animate={{
                        width: isPast ? '100%' : isActive && !isPast ? `${((totalProgress - stepStart) / (1 / 3)) * 100}%` : '0%',
                      }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function SteppedShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentProgress, setCurrentProgress] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const introOffset = 1 / 4;
    const normalizedProgress = Math.max(0, Math.min(1, (v - introOffset) / (1 - introOffset)));
    setCurrentProgress(normalizedProgress);
  });

  const getStepValues = (stepIndex: number) => {
    const stepSize = 1 / 3;
    const transitionSize = 0.06;

    const enterStart = stepIndex * stepSize - transitionSize;
    const enterEnd = stepIndex * stepSize + transitionSize;
    const exitStart = (stepIndex + 1) * stepSize - transitionSize;
    const exitEnd = (stepIndex + 1) * stepSize + transitionSize;

    let opacity = 0;
    let y = 30;

    if (stepIndex === 0) {
      if (currentProgress < exitStart) {
        opacity = 1;
        y = 0;
      } else if (currentProgress < exitEnd) {
        const t = (currentProgress - exitStart) / (exitEnd - exitStart);
        opacity = 1 - t;
        y = -20 * t;
      }
    } else if (stepIndex === 2) {
      if (currentProgress < enterStart) {
        opacity = 0;
        y = 30;
      } else if (currentProgress < enterEnd) {
        const t = (currentProgress - enterStart) / (enterEnd - enterStart);
        opacity = t;
        y = 30 * (1 - t);
      } else {
        opacity = 1;
        y = 0;
      }
    } else {
      if (currentProgress < enterStart) {
        opacity = 0;
        y = 30;
      } else if (currentProgress < enterEnd) {
        const t = (currentProgress - enterStart) / (enterEnd - enterStart);
        opacity = t;
        y = 30 * (1 - t);
      } else if (currentProgress < exitStart) {
        opacity = 1;
        y = 0;
      } else if (currentProgress < exitEnd) {
        const t = (currentProgress - exitStart) / (exitEnd - exitStart);
        opacity = 1 - t;
        y = -20 * t;
      } else {
        opacity = 0;
        y = -20;
      }
    }

    return { opacity, y };
  };

  const step0 = getStepValues(0);
  const step1 = getStepValues(1);
  const step2 = getStepValues(2);
  const stepValues = [step0, step1, step2];

  return (
    <section ref={containerRef} className="relative" style={{ height: '500vh' }}>
      {/* Invisible anchors for ScrollDownIndicator step navigation */}
      <div data-section className="absolute top-[100vh] w-px h-px" aria-hidden="true" />
      <div data-section className="absolute w-px h-px" style={{ top: '233.33vh' }} aria-hidden="true" />
      <div data-section className="absolute w-px h-px" style={{ top: '366.66vh' }} aria-hidden="true" />
      <div className="sticky top-[72px] h-[calc(100vh-72px)] overflow-hidden flex flex-col">
        <ProgressBar scrollProgress={currentProgress} />

        <div className="flex-1 flex items-center pt-6">
          <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center w-full">
            {/* Left: Text */}
            <div className="relative min-h-[320px]">
              {steps.map((step, i) => {
                const { opacity, y } = stepValues[i];
                return (
                  <motion.div
                    key={i}
                    className="absolute inset-0 flex flex-col justify-center"
                    style={{ opacity, y, pointerEvents: opacity > 0.5 ? 'auto' : 'none' }}
                  >
                    <div className="absolute -left-2 -top-4 font-heading text-[8rem] font-black text-foreground/[0.03] leading-none select-none pointer-events-none">
                      {step.num}
                    </div>

                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-5 self-start">
                      <step.icon className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-mono text-primary tracking-wider uppercase">{step.badge}</span>
                    </div>

                    <h2 className="font-heading text-3xl lg:text-[2.75rem] font-bold leading-tight text-foreground whitespace-pre-line mb-6">
                      {step.title}
                    </h2>
                    <p className="text-muted-foreground text-lg leading-relaxed max-w-md">
                      {step.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Right: Visuals */}
            <div className="relative h-[450px]">
              {/* Step 0: Real CVE Cards staggered */}
              <motion.div
                style={{ opacity: step0.opacity, pointerEvents: step0.opacity > 0.3 ? 'auto' : 'none' }}
                className="absolute inset-0 flex flex-col justify-center gap-3 max-w-[420px] ml-auto"
              >
                {realCVEs.map((cve, i) => (
                  <CVECard key={cve.id} cve={cve} opacity={step0.opacity} delay={i * 0.12} />
                ))}
              </motion.div>

              {/* Step 1: Enhanced Risk Chart */}
              <motion.div
                style={{ opacity: step1.opacity, pointerEvents: step1.opacity > 0.3 ? 'auto' : 'none' }}
                className="absolute inset-0 flex items-center"
              >
                <RiskChart opacity={step1.opacity} />
              </motion.div>

              {/* Step 2: Enhanced Workflow */}
              <motion.div
                style={{ opacity: step2.opacity, pointerEvents: step2.opacity > 0.3 ? 'auto' : 'none' }}
                className="absolute inset-0 flex flex-col justify-center gap-3 max-w-md ml-auto"
              >
                {/* CVE Header card — matches CVECard layout */}
                <motion.div
                  className="rounded-xl w-full border border-destructive/15 bg-card/80 backdrop-blur-sm overflow-hidden mb-1"
                  style={{ opacity: step2.opacity }}
                  initial={{ scale: 0.95 }}
                  animate={{ scale: step2.opacity > 0.5 ? 1 : 0.95 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full border border-destructive/30 bg-destructive/10 flex items-center justify-center shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                      </div>
                      <div>
                        <span className="font-mono text-base font-bold text-foreground tracking-tight">CVE-2024-21762</span>
                        <div className="text-sm text-muted-foreground mt-0.5">FortiOS SSL-VPN</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center px-2.5 h-8 rounded-lg bg-destructive/15 border border-destructive/30">
                        <span className="font-mono text-sm font-bold text-destructive">9.8</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 px-5 pb-4 pt-1">
                    {['Exploitable', 'In the Wild', 'CISA KEV'].map((t) => (
                      <span key={t} className="px-2.5 py-1 rounded-md text-xs font-mono tracking-wide text-destructive border border-destructive/20 bg-destructive/5">
                        {t}
                      </span>
                    ))}
                  </div>
                </motion.div>

                {/* Workflow steps */}
                {workflowSteps.map((step, i) => (
                  <WorkflowStepCard
                    key={step.num}
                    step={step}
                    visible={step2.opacity > 0.5}
                    delay={0.1 + i * 0.15}
                  />
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}