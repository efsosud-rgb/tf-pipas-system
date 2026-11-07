import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Kite3DCanvasProps {
  compact?: boolean;
}

export const Kite3DCanvas: React.FC<Kite3DCanvasProps> = ({ compact = false }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 300;
    const height = mountRef.current.clientHeight || (compact ? 90 : 260);

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = compact ? 5.5 : 4.8;
    camera.position.y = 0.2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xe63946, 2.5); // Vermelho Carmim
    dirLight1.position.set(5, 5, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xf4a261, 2.0); // Laranja Sunset
    dirLight2.position.set(-5, -3, 3);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xe9c46a, 2.0, 10); // Amarelo Dourado
    pointLight.position.set(0, 0, 3);
    scene.add(pointLight);

    // Group for the entire kite
    const kiteGroup = new THREE.Group();
    scene.add(kiteGroup);

    // 1. Kite Body (Losango TF Raia Carioca)
    const shape = new THREE.Shape();
    // Top, Right, Bottom, Left vertices of diamond
    shape.moveTo(0, 1.4);      // Top vertex
    shape.lineTo(1.1, 0.3);    // Right vertex
    shape.lineTo(0, -1.3);     // Bottom vertex
    shape.lineTo(-1.1, 0.3);   // Left vertex
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    // Double-sided translucent kite paper
    const paperMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe63946,
      emissive: 0x6e0d16,
      roughness: 0.2,
      metalness: 0.1,
      transmission: 0.4,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    });
    const kiteBody = new THREE.Mesh(geometry, paperMaterial);
    kiteGroup.add(kiteBody);

    // Secondary decorative stripe (Laranja/Amarelo TF Sunset)
    const stripeShape = new THREE.Shape();
    stripeShape.moveTo(0, 1.35);
    stripeShape.lineTo(0.5, 0.3);
    stripeShape.lineTo(0, -0.6);
    stripeShape.lineTo(-0.5, 0.3);
    stripeShape.closePath();
    const stripeGeom = new THREE.ShapeGeometry(stripeShape);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xf4a261,
      emissive: 0xd97724,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const stripeMesh = new THREE.Mesh(stripeGeom, stripeMat);
    stripeMesh.position.z = 0.02;
    kiteGroup.add(stripeMesh);

    // Inner Diamond TF Gold Core
    const coreShape = new THREE.Shape();
    coreShape.moveTo(0, 0.7);
    coreShape.lineTo(0.25, 0.2);
    coreShape.lineTo(0, -0.25);
    coreShape.lineTo(-0.25, 0.2);
    coreShape.closePath();
    const coreGeom = new THREE.ShapeGeometry(coreShape);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xe9c46a,
      side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    coreMesh.position.z = 0.03;
    kiteGroup.add(coreMesh);

    // 2. Armação (Bambu central e Arco de Fibra de Vidro)
    const bambooGeom = new THREE.CylinderGeometry(0.025, 0.025, 2.75, 16);
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });
    const spineMesh = new THREE.Mesh(bambooGeom, bambooMat);
    spineMesh.position.set(0, 0.05, 0.02);
    kiteGroup.add(spineMesh);

    // Bow (Arco recurvo horizontal)
    const curvePoints = [];
    for (let i = 0; i <= 30; i++) {
      const t = (i / 30) * 2 - 1; // -1 to 1
      const x = t * 1.15;
      const y = 0.3 - (t * t) * 0.25; // arqueado aerodinâmico
      curvePoints.push(new THREE.Vector3(x, y, 0.02));
    }
    const bowCurve = new THREE.CatmullRomCurve3(curvePoints);
    const bowGeom = new THREE.TubeGeometry(bowCurve, 32, 0.02, 8, false);
    const bowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 });
    const bowMesh = new THREE.Mesh(bowGeom, bowMat);
    kiteGroup.add(bowMesh);

    // 3. Cauda Dinâmica Articulada com Curvas de Bézier e fitilhos ondulantes
    const TAIL_SEGMENTS = 14;
    const tailMeshes: THREE.Mesh[] = [];
    const tailColors = [0xe63946, 0xf4a261, 0xe9c46a, 0xffffff];

    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      // Fitilho de plástico estilizado
      const ribbonGeom = new THREE.BoxGeometry(0.18 - i * 0.008, 0.08, 0.01);
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: tailColors[i % tailColors.length],
        roughness: 0.3,
        metalness: 0.1,
      });
      const ribbon = new THREE.Mesh(ribbonGeom, ribbonMat);
      scene.add(ribbon);
      tailMeshes.push(ribbon);
    }

    // 4. Partículas Flutuantes de Ambiente 5D (Poeira estelar / ventos mágicos)
    const particleCount = compact ? 30 : 75;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const pColors = new Float32Array(particleCount * 3);

    const c1 = new THREE.Color(0xe63946);
    const c2 = new THREE.Color(0xf4a261);
    const c3 = new THREE.Color(0xe9c46a);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 8;
      positions[i + 1] = (Math.random() - 0.5) * 6;
      positions[i + 2] = (Math.random() - 0.5) * 4;

      const randColor = Math.random() > 0.6 ? c1 : Math.random() > 0.3 ? c2 : c3;
      pColors[i] = randColor.r;
      pColors[i + 1] = randColor.g;
      pColors[i + 2] = randColor.b;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    // Mouse Tracking para Efeito Tilt 5D
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      mouseX = x * 2;
      mouseY = y * 2;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Fluid Floating & Wind Aerodynamics
      const windSway = Math.sin(time * 2.2) * 0.12;
      const windRoll = Math.cos(time * 1.8) * 0.15;
      const hoverY = Math.sin(time * 3.0) * 0.1;

      targetRotationY = mouseX * 0.8 + windRoll;
      targetRotationX = -mouseY * 0.5 + windSway + 0.15;

      // Lerp Suave (Interação 5D)
      kiteGroup.rotation.y += (targetRotationY - kiteGroup.rotation.y) * 0.08;
      kiteGroup.rotation.x += (targetRotationX - kiteGroup.rotation.x) * 0.08;
      kiteGroup.rotation.z = Math.sin(time * 1.5) * 0.08 - mouseX * 0.1;
      kiteGroup.position.y = (compact ? 0 : 0.2) + hoverY;

      // Atualização dos fitilhos da cauda simulando física de vento em cascata
      const tailAnchor = new THREE.Vector3(0, -1.3, 0);
      tailAnchor.applyMatrix4(kiteGroup.matrixWorld);

      let prevPos = tailAnchor.clone();
      for (let i = 0; i < TAIL_SEGMENTS; i++) {
        const ribbon = tailMeshes[i];
        const segDelay = i * 0.18;
        const waveX = Math.sin(time * 4 - segDelay) * (0.2 + i * 0.04);
        const waveZ = Math.cos(time * 3.5 - segDelay) * (0.15 + i * 0.03);

        const targetX = prevPos.x + waveX;
        const targetY = prevPos.y - 0.18;
        const targetZ = prevPos.z + waveZ;

        ribbon.position.set(targetX, targetY, targetZ);
        ribbon.rotation.z = Math.sin(time * 3 - segDelay) * 0.6;
        ribbon.rotation.y = time * 2 + i;
        prevPos = ribbon.position.clone();
      }

      // Rotação sutil das partículas
      particleSystem.rotation.y = time * 0.05;
      particleSystem.rotation.x = time * 0.03;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight || (compact ? 90 : 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [compact]);

  return (
    <div
      ref={mountRef}
      className={`relative w-full ${compact ? 'h-24' : 'h-64'} cursor-grab active:cursor-grabbing overflow-hidden rounded-2xl select-none`}
    />
  );
};
