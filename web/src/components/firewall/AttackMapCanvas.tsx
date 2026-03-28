import { useEffect, useRef } from "react";
import worldMapDark from "@/assets/world-map-dark.png";
import { getCountryCoords } from "@/lib/countryUtils";
import type { TopCountry } from "@/types/analyzerInsights";

interface AttackMapCanvasProps {
  deniedCountries: TopCountry[];
  authFailedCountries: TopCountry[];
  authSuccessCountries: TopCountry[];
  firewallLocation?: { lat: number; lng: number; label: string };
}

// Color per traffic type
const COLORS = {
  denied: "#ef4444",
  authFailed: "#f97316",
  authSuccess: "#22c55e",
  firewall: "#06b6d4",
};

// Offsets calibrados para world-map-dark.png
// O conteúdo geográfico não começa em pixel 0 — há padding interno na imagem
const IMG_LEFT = 0.02; // medido: conteúdo geográfico começa em ~6.9% da esquerda
const IMG_RIGHT = 0.06; // medido: conteúdo geográfico termina a ~5.9% da direita
const IMG_TOP = 0.13; // medido: Ártico começa em ~7.9% do topo
const IMG_BOTTOM = 0.02; // medido: Antártica começa em ~7.9% do rodapé

// Equirectangular projection calibrada: lat/lng → canvas pixel
function project(lat: number, lng: number, w: number, h: number): [number, number] {
  const usableW = w * (1 - IMG_LEFT - IMG_RIGHT);
  const usableH = h * (1 - IMG_TOP - IMG_BOTTOM);
  const x = w * IMG_LEFT + ((lng + 180) / 360) * usableW;
  const y = h * IMG_TOP + ((90 - lat) / 180) * usableH;
  return [x, y];
}

interface Route {
  lat: number;
  lng: number;
  color: string;
  radius: number;
  count: number;
}

interface Projectile {
  routeIdx: number;
  progress: number; // 0..1
  delay: number; // 0..1 initial offset
}

export function AttackMapCanvas({
  deniedCountries,
  authFailedCountries,
  authSuccessCountries,
  firewallLocation,
}: AttackMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgLoadedRef = useRef(false);
  const projectilesRef = useRef<Projectile[]>([]);
  const routesRef = useRef<Route[]>([]);
  const lastTimeRef = useRef<number>(0);

  // Build routes from props
  useEffect(() => {
    const routes: Route[] = [];

    const maxCount = Math.max(
      ...deniedCountries.map((c) => c.count),
      ...authFailedCountries.map((c) => c.count),
      ...authSuccessCountries.map((c) => c.count),
      1,
    );

    const addRoutes = (countries: TopCountry[], color: string) => {
      countries.forEach((c) => {
        const coords = getCountryCoords(c.country);
        if (!coords) return;
        const [lat, lng] = coords;
        const radius = 3 + (c.count / maxCount) * 8;
        routes.push({ lat, lng, color, radius, count: c.count });
      });
    };

    addRoutes(deniedCountries, COLORS.denied);
    addRoutes(authFailedCountries, COLORS.authFailed);
    addRoutes(authSuccessCountries, COLORS.authSuccess);

    routesRef.current = routes;

    // Build projectiles: 3 per route, staggered
    const projectiles: Projectile[] = [];
    routes.forEach((_, i) => {
      projectiles.push({ routeIdx: i, progress: 0, delay: 0 });
      projectiles.push({ routeIdx: i, progress: 0, delay: 0.33 });
      projectiles.push({ routeIdx: i, progress: 0, delay: 0.66 });
    });
    projectilesRef.current = projectiles;
  }, [deniedCountries, authFailedCountries, authSuccessCountries]);

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.src = worldMapDark;
    img.onload = () => {
      imgRef.current = img;
      imgLoadedRef.current = true;
    };
    imgRef.current = img;
  }, []);

  // Animation loop + ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const SPEED = 0.18; // units per second (full traversal in ~5.5s)

    const draw = (timestamp: number) => {
      const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = timestamp;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Draw map image
      if (imgLoadedRef.current && imgRef.current) {
        ctx.drawImage(imgRef.current, 0, 0, W, H);
      } else {
        ctx.fillStyle = "#0a0e1a";
        ctx.fillRect(0, 0, W, H);
      }

      const routes = routesRef.current;
      const projectiles = projectilesRef.current;

      // Firewall position
      const fwLat = firewallLocation?.lat ?? -15;
      const fwLng = firewallLocation?.lng ?? -47;
      const [fwX, fwY] = project(fwLat, fwLng, W, H);

      // Draw trail lines
      routes.forEach((route) => {
        const [ox, oy] = project(route.lat, route.lng, W, H);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(fwX, fwY);
        ctx.strokeStyle = route.color + "28";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.restore();
      });

      // Update & draw projectiles
      projectiles.forEach((proj) => {
        const route = routes[proj.routeIdx];
        if (!route) return;

        // Advance progress (accounting for delay)
        const effectiveProgress = (proj.progress + proj.delay) % 1;
        proj.progress = (proj.progress + dt * SPEED) % 1;

        const [ox, oy] = project(route.lat, route.lng, W, H);
        const px = ox + (fwX - ox) * effectiveProgress;
        const py = oy + (fwY - oy) * effectiveProgress;

        // Glow projectile
        ctx.save();
        ctx.shadowColor = route.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = route.color;
        ctx.fill();
        ctx.restore();
      });

      // Draw country markers
      routes.forEach((route) => {
        const [ox, oy] = project(route.lat, route.lng, W, H);
        ctx.save();
        ctx.shadowColor = route.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(ox, oy, route.radius, 0, Math.PI * 2);
        ctx.fillStyle = route.color + "55";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ox, oy, route.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = route.color + "cc";
        ctx.fill();
        ctx.restore();
      });

      // Firewall marker — pulsing ring
      const pulse = 0.5 + 0.5 * Math.sin(timestamp / 400);
      ctx.save();
      ctx.shadowColor = COLORS.firewall;
      ctx.shadowBlur = 20;
      // Outer ring pulse
      ctx.beginPath();
      ctx.arc(fwX, fwY, 10 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.firewall + "55";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inner solid
      ctx.beginPath();
      ctx.arc(fwX, fwY, 7, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.firewall;
      ctx.fill();
      ctx.restore();

      // Firewall label
      if (firewallLocation?.label) {
        ctx.save();
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(firewallLocation.label, fwX, fwY - 16);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [firewallLocation]);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", background: "#0a0e1a" }} />;
}
