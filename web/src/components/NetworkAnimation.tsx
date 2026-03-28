import { useEffect, useRef } from "react";
import * as THREE from "three";

export function NetworkAnimation(props: { className?: string }) {
  const className = props.className || "";
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
    
    // Câmera no alto lá atrás, olhando firmemente para as faixas
    camera.position.set(0, 40, 100);
    camera.rotation.x = -0.25;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const count = 40000;
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    const sizes = new Float32Array(count);
    
    const numLanes = 220;
    const particlesPerLane = Math.floor(count / numLanes);
    
    for (let i = 0; i < count; i++) {
      const laneIndex = i % numLanes;
      const depthIndex = Math.floor(i / numLanes);
      
      const zProgress = depthIndex / particlesPerLane;
      const pz = 50.0 - Math.pow(zProgress, 0.8) * 800.0;
      
      const laneProgress = laneIndex / numLanes;
      const basePx = (laneProgress * 2.0 - 1.0) * 600.0;
      
      const zigzag1 = Math.sin(pz * 0.02 + basePx * 0.01) * 35.0;
      const zigzag2 = Math.cos(pz * 0.012 - basePx * 0.008) * 45.0;
      
      const px = basePx + zigzag1 + zigzag2;
      
      positions[i * 3] = px;
      positions[i * 3 + 1] = -5.0;
      positions[i * 3 + 2] = pz;
      
      alphas[i] = 0.5 + Math.random() * 0.5;
      sizes[i] = 1.0 + Math.random() * 2.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const vertexShader = [
      "attribute float aAlpha;",
      "attribute float aSize;",
      "varying float vAlpha;",
      "varying vec3 vPos;",
      "void main() {",
      "  vec3 pos = position;",
      "  vPos = pos;",
      "  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);",
      "  gl_Position = projectionMatrix * mvPosition;",
      "  vAlpha = aAlpha;",
      "  float distanceScale = 140.0 / max(-mvPosition.z, 0.001);",
      "  gl_PointSize = clamp(aSize * distanceScale, 2.0, 32.0);",
      "}"
    ].join("\\n");

    const fragmentShader = [
      "varying float vAlpha;",
      "varying vec3 vPos;",
      "void main() {",
      "  vec2 coord = gl_PointCoord - vec2(0.5);",
      "  float dist = length(coord);",
      "  if (dist > 0.5) discard;",
      "  float glow = smoothstep(1.0, 0.0, dist * 2.0);",
      "  vec3 cyan = vec3(0.08, 0.75, 0.95);",
      "  vec3 magenta = vec3(0.75, 0.08, 0.95);",
      "  float colorMix = sin(vPos.x * 0.02 + vPos.z * 0.01) * 0.5 + 0.5;",
      "  vec3 finalColor = mix(cyan, magenta, colorMix);",
      "  gl_FragColor = vec4(finalColor, vAlpha * glow);",
      "}"
    ].join("\\n");

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      renderer.render(scene, camera);
      requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Forçando o fill de tela com div styles injetados no inline, sem depender da className crua que pode estar corrompida.
  return (
    <div 
      ref={containerRef} 
      className={"pointer-events-none z-[-1] " + className} 
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1 }}
    />
  );
}
