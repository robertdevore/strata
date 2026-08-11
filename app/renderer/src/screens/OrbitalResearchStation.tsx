import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ── Types ─────────────────────────────────────────
interface OrbitalObjectData {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string;
  orbitRadius: number;
  orbitSpeed: number;
  orbitInclination: number;
  startAngle: number;
  mesh: THREE.Group;
  pathLine: THREE.Line;
}

interface LabelData {
  obj: THREE.Object3D;
  el: HTMLDivElement;
}

// ── Helpers ───────────────────────────────────────
function createProceduralPlanetTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const baseGrad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  baseGrad.addColorStop(0, '#3a6b8c');
  baseGrad.addColorStop(0.3, '#2d5a7a');
  baseGrad.addColorStop(0.6, '#1e4460');
  baseGrad.addColorStop(0.85, '#163248');
  baseGrad.addColorStop(1, '#0e1e2c');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  const noiseScale = 0.05;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let n = 0;
      n += Math.sin(x * noiseScale * 1.3 + y * noiseScale * 0.7) * 0.5;
      n += Math.sin(x * noiseScale * 2.7 - y * noiseScale * 1.9) * 0.3;
      n += Math.sin(x * noiseScale * 5.1 + y * noiseScale * 3.3) * 0.15;
      n += Math.sin(x * noiseScale * 11.3 - y * noiseScale * 7.1) * 0.05;
      n = (n + 1) / 2;
      const variation = (n - 0.5) * 40;
      data[idx] = Math.max(0, Math.min(255, data[idx] + variation));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + variation * 0.8));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + variation * 0.5));
    }
  }
  ctx.putImageData(imageData, 0, 0);

  for (let c = 0; c < 30; c++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const cr = Math.random() * 20 + 4;
    const craterGrad = ctx.createRadialGradient(cx, cy, cr * 0.3, cx, cy, cr);
    craterGrad.addColorStop(0, 'rgba(20,30,40,0.5)');
    craterGrad.addColorStop(0.6, 'rgba(30,45,60,0.3)');
    craterGrad.addColorStop(0.8, 'rgba(50,70,90,0.15)');
    craterGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = craterGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStarSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.05)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

// ── Component ─────────────────────────────────────
export const OrbitalResearchStation: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Mutable refs for animation loop
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const objectsRef = useRef<OrbitalObjectData[]>([]);
  const labelsDataRef = useRef<LabelData[]>([]);
  const highlightRef = useRef<THREE.Group | null>(null);
  const planetCloudsRef = useRef<THREE.Mesh | null>(null);
  const ringGroupRef = useRef<THREE.Group | null>(null);
  const antennaRef = useRef<THREE.Group | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const orbitPathsRef = useRef<THREE.Line[]>([]);
  const animFrameRef = useRef<number>(0);
  const accumulatedTimeRef = useRef(0);
  const isPausedRef = useRef(false);
  const showLabelsRef = useRef(true);

  // Keep refs in sync
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);

  const selectedData = objectsRef.current.find((o) => o.id === selectedId) ?? null;

  // ── Init / Teardown ────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c10);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1000);
    camera.position.set(8, 5, 14);
    camera.lookAt(0, 0.5, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.8;
    controls.target.set(0, 0.5, 0);
    controls.update();
    controlsRef.current = controls;

    // ── Lighting ──────────────────────────────────
    scene.add(new THREE.AmbientLight(0x1a2a40, 0.6));

    const sunLight = new THREE.DirectionalLight(0xffeedd, 4.5);
    sunLight.position.set(20, 10, -5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.bias = -0.0001;
    scene.add(sunLight);

    scene.add(new THREE.DirectionalLight(0x4488cc, 1.2).translateX(-8).translateY(-2).translateZ(8));

    // ── Starfield ────────────────────────────────
    const starsCount = 2000;
    const starPositions = new Float32Array(starsCount * 3);
    const starSizes = new Float32Array(starsCount);
    const starColors = new Float32Array(starsCount * 3);
    const palette = [0xffffff, 0xaaccff, 0xffeedd, 0xccddff, 0xffd4a8].map((c) => new THREE.Color(c));

    for (let i = 0; i < starsCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 60 + Math.random() * 40;
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);
      starSizes[i] = Math.random() * 2.5 + 0.3;
      const col = palette[Math.floor(Math.random() * palette.length)];
      starColors[i * 3] = col.r;
      starColors[i * 3 + 1] = col.g;
      starColors[i * 3 + 2] = col.b;
    }

    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeom.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    starGeom.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.25,
      map: createStarSpriteTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    scene.add(new THREE.Points(starGeom, starMat));

    // ── Planet ───────────────────────────────────
    const planetGroup = new THREE.Group();
    const planetGeom = new THREE.SphereGeometry(2.5, 64, 64);
    const planetMat = new THREE.MeshStandardMaterial({
      map: createProceduralPlanetTexture(1024),
      roughness: 0.85,
      metalness: 0.05,
    });
    const planet = new THREE.Mesh(planetGeom, planetMat);
    planet.name = 'Planet';
    planet.castShadow = true;
    planet.receiveShadow = true;
    planetGroup.add(planet);

    // Clouds
    const cloudGeom = new THREE.SphereGeometry(2.55, 48, 48);
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 512;
    cloudCanvas.height = 512;
    const cctx = cloudCanvas.getContext('2d')!;
    for (let i = 0; i < 60; i++) {
      const wx = Math.random() * 512;
      const wy = Math.random() * 512;
      const wr = Math.random() * 40 + 10;
      const wgrad = cctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      wgrad.addColorStop(0, 'rgba(255,255,255,0.12)');
      wgrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      wgrad.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.fillStyle = wgrad;
      cctx.beginPath();
      cctx.arc(wx, wy, wr, 0, Math.PI * 2);
      cctx.fill();
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
    });
    const clouds = new THREE.Mesh(cloudGeom, cloudMat);
    clouds.name = 'Clouds';
    planetCloudsRef.current = clouds;
    planetGroup.add(clouds);

    // Atmosphere glow
    const atmosGeom = new THREE.SphereGeometry(2.75, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x4da8da) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - abs(dot(viewDir, vNormal));
          fresnel = pow(fresnel, 3.5);
          float alpha = fresnel * 0.45;
          vec3 color = uColor * (1.0 + fresnel * 0.5);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const atmosphere = new THREE.Mesh(atmosGeom, atmosMat);
    atmosphere.name = 'Atmosphere';
    atmosphereRef.current = atmosphere;
    planetGroup.add(atmosphere);

    scene.add(planetGroup);

    // ── Space Station ─────────────────────────────
    const station = new THREE.Group();
    station.name = 'Research Station';
    station.position.set(0, 0.8, 4.5);

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.7 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xccdde8, roughness: 0.3, metalness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5, metalness: 0.6 });
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.2, metalness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x4da8da, roughness: 0.2, metalness: 0.1,
      emissive: 0x4da8da, emissiveIntensity: 0.6,
    });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.1, metalness: 0.1,
      emissive: 0xffffff, emissiveIntensity: 0.8,
    });
    const redLightMat = new THREE.MeshStandardMaterial({
      color: 0xff4444, roughness: 0.1, metalness: 0.1,
      emissive: 0xff2222, emissiveIntensity: 0.7,
    });
    const greenLightMat = new THREE.MeshStandardMaterial({
      color: 0x44ff88, roughness: 0.1, metalness: 0.1,
      emissive: 0x22ff66, emissiveIntensity: 0.7,
    });

    // Central hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 24), hullMat);
    hub.castShadow = true;
    hub.receiveShadow = true;
    station.add(hub);

    // Hub caps
    const capGeom = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const topCap = new THREE.Mesh(capGeom, accentMat);
    topCap.position.y = 0.6;
    topCap.castShadow = true;
    station.add(topCap);
    const bottomCap = new THREE.Mesh(capGeom, accentMat);
    bottomCap.position.y = -0.6;
    bottomCap.rotation.z = Math.PI;
    bottomCap.castShadow = true;
    station.add(bottomCap);

    // Habitat ring
    const ringGroup = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 16, 32), accentMat);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    ring.receiveShadow = true;
    ringGroup.add(ring);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const detail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), darkMat);
      detail.position.set(Math.cos(angle) * 0.7, 0, Math.sin(angle) * 0.7);
      detail.castShadow = true;
      ringGroup.add(detail);
    }
    station.add(ringGroup);
    ringGroupRef.current = ringGroup;

    // Arms + modules
    const armDefs = [
      { x: 0.6, z: 0, ry: 0, name: 'AstroLab' },
      { x: -0.6, z: 0, ry: Math.PI, name: 'BioDome' },
      { x: 0, z: 0.6, ry: Math.PI / 2, name: 'Physics Bay' },
      { x: 0, z: -0.6, ry: -Math.PI / 2, name: 'Engine Room' },
    ];
    armDefs.forEach((def) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12), darkMat);
      arm.position.set(def.x, 0, def.z);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = def.ry;
      arm.castShadow = true;
      station.add(arm);

      const modGroup = new THREE.Group();
      modGroup.name = def.name;
      const mod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16), hullMat);
      mod.castShadow = true;
      mod.receiveShadow = true;
      modGroup.add(mod);
      const domeTop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
      domeTop.position.y = 0.25;
      domeTop.castShadow = true;
      modGroup.add(domeTop);
      const domeBot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
      domeBot.position.y = -0.25;
      domeBot.rotation.z = Math.PI;
      domeBot.castShadow = true;
      modGroup.add(domeBot);
      modGroup.position.set(def.x * 2.2, 0, def.z * 2.2);
      station.add(modGroup);
    });

    // Solar panels
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.25), solarMat);
        panel.position.set(side * 1.1, 0, (i - 1) * 0.35);
        panel.castShadow = true;
        panel.receiveShadow = true;
        station.add(panel);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.03, 0.29), darkMat);
        frame.position.copy(panel.position);
        station.add(frame);
      }
    }

    // Antenna
    const antennaGroup = new THREE.Group();
    antennaGroup.position.set(0, 0.9, 0);
    antennaGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), darkMat).translateY(0.25));
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), accentMat
    );
    dish.position.y = 0.55;
    dish.rotation.x = Math.PI;
    dish.castShadow = true;
    antennaGroup.add(dish);
    antennaGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), redLightMat).translateY(0.65));
    station.add(antennaGroup);
    antennaRef.current = antennaGroup;

    // Sensor boom
    const ant2 = new THREE.Group();
    ant2.position.set(0, -0.9, 0.3);
    ant2.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), darkMat).translateY(-0.2));
    ant2.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), greenLightMat).translateY(-0.45));
    station.add(ant2);

    // Station lights
    const lightDirs = [
      [0.35, 0.4, 0], [-0.35, 0.4, 0], [0, 0.4, 0.35], [0, 0.4, -0.35],
      [0.35, -0.4, 0], [-0.35, -0.4, 0], [0, -0.4, 0.35], [0, -0.4, -0.35],
    ];
    lightDirs.forEach(([x, y, z]) => {
      station.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), lightMat).translateX(x).translateY(y).translateZ(z));
    });

    // Docking port
    const dock = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 16), accentMat);
    dock.position.set(0, 0, 0.5);
    dock.rotation.x = Math.PI / 2;
    dock.castShadow = true;
    station.add(dock);
    station.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 16), glowMat).translateZ(0.6));

    scene.add(station);

    // ── Satellites ───────────────────────────────
    function createSatellite(
      id: string, name: string, type: string, status: string, description: string,
      color: number, orbitRadius: number, orbitSpeed: number, orbitInclination: number,
      startAngle: number, size: number,
    ): OrbitalObjectData {
      const group = new THREE.Group();
      group.name = name;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.6, size * 0.8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.8 }),
      );
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      for (let s = -1; s <= 1; s += 2) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(size * 1.5, size * 0.05, size * 0.3),
          new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.2, metalness: 0.9 }),
        );
        panel.position.x = s * size * 0.9;
        panel.castShadow = true;
        group.add(panel);
      }

      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.05, size * 0.05, size * 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.3, metalness: 0.7 }),
      );
      ant.position.y = size * 0.5;
      group.add(ant);
      group.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(size * 0.08, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.1, emissive: 0xff2222, emissiveIntensity: 0.6 }),
        ).translateY(size * 0.8),
      );

      // Orbit path
      const pathPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pathPoints.push(new THREE.Vector3(
          Math.cos(a) * orbitRadius,
          Math.sin(a) * orbitRadius * Math.sin(orbitInclination),
          Math.sin(a) * orbitRadius,
        ));
      }
      const pathGeom = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const pathLine = new THREE.Line(
        pathGeom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25, depthTest: true }),
      );

      scene.add(group);
      scene.add(pathLine);
      orbitPathsRef.current.push(pathLine);

      return {
        id, name, type, status, description,
        orbitRadius, orbitSpeed, orbitInclination, startAngle,
        mesh: group,
        pathLine,
      };
    }

    const satellites: OrbitalObjectData[] = [
      createSatellite('sat-1', 'CommSat Alpha', 'Communications Satellite', 'Nominal',
        'High-gain communications relay providing continuous data link between the station and ground control. Equipped with Ka-band transceivers.',
        0x8899bb, 6.5, 0.35, 0.15, 0, 0.25),
      createSatellite('sat-2', 'Science Probe Theta', 'Science Probe', 'Active Scan',
        'Multi-spectral science platform conducting atmospheric analysis and magnetosphere surveys. Carries particle detectors and UV spectrometers.',
        0xbb9966, 7.8, 0.22, -0.3, Math.PI * 0.7, 0.3),
      createSatellite('sat-3', 'Nav Beacon Gamma', 'Navigation Beacon', 'Nominal',
        'Navigation and positioning beacon broadcasting on L-band frequencies. Provides approach guidance for docking vessels.',
        0x66aacc, 5.8, 0.42, 0.5, Math.PI * 1.3, 0.2),
      createSatellite('sat-4', 'Observatory Epsilon', 'Observatory', 'Calibrating',
        'Deep-space observatory with cryogenically cooled infrared telescope. Monitoring stellar phenomena and exoplanet transits.',
        0x9988aa, 9.0, 0.18, -0.1, Math.PI * 0.4, 0.35),
    ];

    // Station as selectable
    const stationData: OrbitalObjectData = {
      id: 'station',
      name: 'STRATA-7 Station',
      type: 'Orbital Research Platform',
      status: 'Operational',
      description: 'The STRATA-7 orbital research platform, positioned at the L4 Lagrange point. A modular facility supporting long-duration scientific missions with rotating crew complements.',
      orbitRadius: 4.5,
      orbitSpeed: 0,
      orbitInclination: 0,
      startAngle: 0,
      mesh: station,
      pathLine: new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
    };

    objectsRef.current = [stationData, ...satellites];

    // ── Highlight group ──────────────────────────
    const highlightGroup = new THREE.Group();
    highlightGroup.visible = false;
    scene.add(highlightGroup);
    highlightRef.current = highlightGroup;

    // ── Labels ───────────────────────────────────
    const labelEls: LabelData[] = [];
    [planet, station, ...satellites.map((s) => s.mesh)].forEach((obj) => {
      const el = document.createElement('div');
      el.className = 'ors-label';
      el.textContent = obj.name;
      if (labelsRef.current) labelsRef.current.appendChild(el);
      labelEls.push({ obj, el });
    });
    labelsDataRef.current = labelEls;

    // ── Raycaster ────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const allMeshes: THREE.Object3D[] = [station, ...satellites.map((s) => s.mesh)];

    const getIntersection = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      return raycaster.intersectObjects(allMeshes, true);
    };

    const findSelectable = (intersect: THREE.Intersection): OrbitalObjectData | null => {
      let obj: THREE.Object3D | null = intersect.object;
      while (obj) {
        const found = objectsRef.current.find((o) => o.mesh === obj);
        if (found) return found;
        obj = obj.parent;
      }
      return null;
    };

    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ors-ui')) return;
      const hits = getIntersection(e);
      if (hits.length > 0) {
        const data = findSelectable(hits[0]);
        setSelectedId(data ? data.id : null);
      } else {
        setSelectedId(null);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
      if (e.key === ' ' && !(e.target as HTMLElement).closest('input,button,textarea')) {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
      if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement).closest('input,button,textarea')) {
        setShowLabels((l) => !l);
      }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement).closest('input,button,textarea')) {
        resetCamera();
      }
    };

    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);

    // ── Resize ───────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // ── Animation loop ───────────────────────────
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const driftSpeed = reducedMotion ? 0.02 : 0.08;
    const driftAmp = reducedMotion ? 0.05 : 0.2;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      const rawDelta = clockRef.current.getDelta();
      const dt = isPausedRef.current ? 0 : Math.min(rawDelta, 0.1);
      if (!isPausedRef.current) accumulatedTimeRef.current += dt;
      const t = accumulatedTimeRef.current;

      controls.update();

      // Camera drift
      controls.target.x += Math.sin(t * driftSpeed) * driftAmp * dt;
      controls.target.y += Math.cos(t * driftSpeed * 0.7) * driftAmp * 0.6 * dt;
      controls.target.x += (0 - controls.target.x) * 0.1 * dt;
      controls.target.y += (0.5 - controls.target.y) * 0.1 * dt;

      // Planet clouds
      if (planetCloudsRef.current) planetCloudsRef.current.rotation.y += dt * 0.04;

      // Habitat ring
      if (ringGroupRef.current) ringGroupRef.current.rotation.y += dt * 0.6;

      // Antenna
      if (antennaRef.current) antennaRef.current.rotation.y += dt * 0.15;

      // Atmosphere
      if (atmosphereRef.current && atmosphereRef.current.material instanceof THREE.ShaderMaterial) {
        atmosphereRef.current.material.uniforms.uTime.value = t;
      }

      // Satellites
      objectsRef.current.forEach((obj) => {
        if (obj.orbitSpeed === 0) return;
        const angle = obj.startAngle + t * obj.orbitSpeed;
        obj.mesh.position.x = Math.cos(angle) * obj.orbitRadius;
        obj.mesh.position.z = Math.sin(angle) * obj.orbitRadius;
        obj.mesh.position.y = Math.sin(angle) * obj.orbitRadius * Math.sin(obj.orbitInclination);
        obj.mesh.rotation.y = -angle + Math.PI / 2;
        obj.mesh.rotation.z = obj.orbitInclination * 0.5;
      });

      // Highlight
      if (highlightRef.current && selectedId) {
        const data = objectsRef.current.find((o) => o.id === selectedId);
        if (data) {
          highlightRef.current.visible = true;
          const wp = new THREE.Vector3();
          data.mesh.getWorldPosition(wp);
          highlightRef.current.position.copy(wp);
          highlightRef.current.rotation.y += dt * 1.5;
          highlightRef.current.rotation.x += dt * 0.7;

          // Rebuild rings if needed
          if (highlightRef.current.children.length === 0) {
            const box = new THREE.Box3().setFromObject(data.mesh);
            const sz = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(sz.x, sz.y, sz.z) * 0.7;
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x4da8da, transparent: true, opacity: 0.8, depthTest: true, depthWrite: false,
            });
            for (let r = 0; r < 3; r++) {
              const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(maxDim * (1 - r * 0.3), 0.03, 16, 32), ringMat);
              ringMesh.rotation.x = Math.PI / 2;
              if (r === 1) ringMesh.rotation.z = Math.PI / 2;
              highlightRef.current.add(ringMesh);
            }
          }
        } else {
          highlightRef.current.visible = false;
        }
      } else if (highlightRef.current) {
        highlightRef.current.visible = false;
      }

      // Labels
      if (showLabelsRef.current) {
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;
        labelsDataRef.current.forEach(({ obj, el }) => {
          const wp = new THREE.Vector3();
          obj.getWorldPosition(wp);
          const camDir = new THREE.Vector3();
          camera.getWorldDirection(camDir);
          const toObj = wp.clone().sub(camera.position);
          if (toObj.dot(camDir) < 0) {
            el.style.opacity = '0';
            return;
          }
          const sp = wp.clone().project(camera);
          const x = sp.x * halfW + halfW;
          const y = -sp.y * halfH + halfH;
          if (x < -50 || x > window.innerWidth + 50 || y < -50 || y > window.innerHeight + 50) {
            el.style.opacity = '0';
            return;
          }
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.style.opacity = '1';
        });
      } else {
        labelsDataRef.current.forEach(({ el }) => { el.style.opacity = '0'; });
      }

      // Orbit paths
      orbitPathsRef.current.forEach((p) => { p.visible = showLabelsRef.current; });

      renderer.render(scene, camera);
    };

    requestAnimationFrame(animate);

    // ── Cleanup ──────────────────────────────────
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      labelsDataRef.current.forEach(({ el }) => el.remove());
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera reset ───────────────────────────────
  const resetCamera = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const camera = cam;
    const controls = ctrl;

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(8, 5, 14);
    const endTarget = new THREE.Vector3(0, 0.5, 0);
    const startTime = performance.now();
    const duration = 800;

    function anim(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      camera.position.lerpVectors(startPos, endPos, ease);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      controls.update();
      if (t < 1) requestAnimationFrame(anim);
    }
    requestAnimationFrame(anim);
  }, []);

  // ── Distance helper ────────────────────────────
  const getDistance = (data: OrbitalObjectData): string => {
    const wp = new THREE.Vector3();
    data.mesh.getWorldPosition(wp);
    const dist = wp.length();
    return `${(dist * 1200).toFixed(0)} km`;
  };

  // ── Render ─────────────────────────────────────
  return (
    <div style={{
      width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden',
      background: '#080c10', fontFamily: "'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif",
      color: '#e0e4ea',
    }}>
      {/* 3D canvas */}
      <div ref={mountRef} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />

      {/* Vignette */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(8,12,16,0.55) 100%)',
      }} />

      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 3, pointerEvents: 'none', opacity: 0.03,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)',
      }} />

      {/* Labels container */}
      <div ref={labelsRef} style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }} />

      {/* Title */}
      <div className="ors-ui" style={{
        position: 'fixed', top: 24, left: 24, zIndex: 10, pointerEvents: 'none',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.02em', margin: 0, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
          Orbital Research Station
        </h1>
        <div style={{ fontSize: 12, color: '#8a94a6', fontFamily: 'monospace', letterSpacing: '0.04em', marginTop: 2 }}>
          STRATA-7 · LAGRANGE POINT L4
        </div>
      </div>

      {/* Info Panel */}
      <div className="ors-ui" style={{
        position: 'fixed', right: 20, top: '50%', transform: selectedData ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(20px)',
        zIndex: 10, width: 300, maxWidth: 'calc(100vw - 40px)',
        background: 'rgba(10,16,24,0.85)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: 20, backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        opacity: selectedData ? 1 : 0, pointerEvents: selectedData ? 'auto' : 'none',
        transition: 'opacity 220ms ease, transform 220ms ease',
      }} role="complementary" aria-label="Object information">
        {selectedData && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{selectedData.name}</span>
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Close information panel"
                style={{
                  background: 'none', border: 'none', color: '#8a94a6', cursor: 'pointer',
                  fontSize: 18, width: 28, height: 28, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', borderRadius: 6,
                }}
              >✕</button>
            </div>
            <InfoRow label="Type" value={selectedData.type} />
            <InfoRow label="Status" value={selectedData.status} isStatus />
            <InfoRow label="Distance" value={getDistance(selectedData)} />
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#8a94a6', lineHeight: 1.5 }}>
              {selectedData.description}
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="ors-ui" role="toolbar" aria-label="Scene controls" style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', gap: 8, background: 'rgba(10,16,24,0.85)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 28, padding: 6,
        backdropFilter: 'blur(16px)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <CtrlBtn icon="⟳" label="Reset" onClick={resetCamera} ariaLabel="Reset camera position" />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 4px' }} />
        <CtrlBtn
          icon={isPaused ? '▶' : '⏸'}
          label={isPaused ? 'Play' : 'Pause'}
          onClick={() => setIsPaused((p) => !p)}
          ariaLabel={isPaused ? 'Resume orbital motion' : 'Pause orbital motion'}
          active={isPaused}
        />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 4px' }} />
        <CtrlBtn
          icon="🏷"
          label="Labels"
          onClick={() => setShowLabels((l) => !l)}
          ariaLabel="Toggle object labels"
          active={showLabels}
        />
      </div>

      {/* Keyboard hint */}
      <div style={{
        position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
        fontSize: 11, color: '#8a94a6', fontFamily: 'monospace', pointerEvents: 'none', opacity: 0.7,
      }}>
        Drag to orbit · Scroll to zoom · Click to select · Esc to clear
      </div>

      {/* SR-only description */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        Orbital Research Station is an interactive 3D visualization of a futuristic space station orbiting a glowing planet.
        Use mouse or touch to rotate, zoom, and inspect the scene. Click objects to learn about them.
        Use the control bar at the bottom to reset the camera, pause motion, or toggle labels. Press Escape to clear your selection.
      </div>

      {/* Inline styles for labels */}
      <style>{`
        .ors-label {
          position: fixed;
          z-index: 5;
          pointer-events: none;
          font-family: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #e0e4ea;
          background: rgba(10,16,24,0.75);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 4px;
          padding: 3px 8px;
          white-space: nowrap;
          transform: translate(-50%, -50%);
          transition: opacity 220ms ease;
          text-shadow: 0 0 8px rgba(0,0,0,0.8);
        }
        .ors-label::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 6px;
          height: 6px;
          background: #4da8da;
          border-radius: 50%;
          box-shadow: 0 0 6px rgba(77,168,218,0.3);
        }
        @media (max-width: 768px) {
          .ors-label { font-size: 10px; padding: 2px 6px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ors-label { transition: none; }
        }
      `}</style>
    </div>
  );
};

// ── Sub-components ───────────────────────────────
const InfoRow: React.FC<{ label: string; value: string; isStatus?: boolean }> = ({ label, value, isStatus }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', fontSize: 13 }}>
    <span style={{ color: '#8a94a6', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10, flexShrink: 0, marginRight: 12 }}>
      {label}
    </span>
    {isStatus ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#e0e4ea', fontFamily: 'monospace', fontSize: 12 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
          background: value.toLowerCase().includes('warning') || value.toLowerCase().includes('alert') ? '#d4a843' : '#4ec9a0',
          boxShadow: `0 0 6px ${value.toLowerCase().includes('warning') || value.toLowerCase().includes('alert') ? '#d4a843' : '#4ec9a0'}`,
        }} />
        {value}
      </span>
    ) : (
      <span style={{ color: '#e0e4ea', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word' }}>
        {value}
      </span>
    )}
  </div>
);

const CtrlBtn: React.FC<{
  icon: string; label: string; onClick: () => void;
  ariaLabel: string; active?: boolean;
}> = ({ icon, label, onClick, ariaLabel, active }) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
      border: 'none', borderRadius: 22, background: active ? 'rgba(77,168,218,0.15)' : 'transparent',
      color: active ? '#4da8da' : '#8a94a6', fontFamily: 'inherit', fontSize: 13,
      fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.01em',
      transition: 'all 220ms ease',
    }}
  >
    <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
    <span>{label}</span>
  </button>
);
