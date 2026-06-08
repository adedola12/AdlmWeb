// Real 3D persona scene for the Purchase page (raw three.js — no new deps;
// `three` is already a project dependency). Procedural low-poly models:
//   • "personal"     → a hard-hat Quantity Surveyor figure + ₦ coin
//   • "organization" → an office skyline with lit windows + team nodes
//
// The active model auto-rotates and gently bobs; switching the license type
// cross-fades (scales) between the two. Lazy-loaded by Purchase.jsx behind a
// Suspense fallback (the SVG <LicenseScene>). Falls back to the SVG when
// WebGL is unavailable or the user prefers reduced motion.

import React from "react";
import * as THREE from "three";
import LicenseScene from "./LicenseScene.jsx";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/* Canvas texture of lit office windows, used as map + emissiveMap. */
function makeWindowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#13315a";
  x.fillRect(0, 0, 64, 128);
  for (let yy = 12; yy < 118; yy += 16) {
    for (let xx = 8; xx < 58; xx += 16) {
      x.fillStyle = Math.random() > 0.4 ? "#9cd3ff" : "#284f7d";
      x.fillRect(xx, yy, 10, 11);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Soft radial contact shadow (alpha) for grounding the model. */
function makeShadowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildPersonal() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1d3e6e, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c8a8, roughness: 0.85 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86a27, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0f5fd6, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a1c33, roughness: 0.9 });

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 0.18, 48), dark);
  platform.position.y = -1.15;
  g.add(platform);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.7, 6, 16), navy);
  torso.position.y = -0.1;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), skin);
  head.position.y = 0.82;
  g.add(head);

  const hat = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    orange,
  );
  hat.position.y = 1.02;
  g.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.07, 32), orange);
  brim.position.y = 1.0;
  g.add(brim);

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.05), blue);
  board.position.set(0.66, -0.05, 0.38);
  board.rotation.set(0.12, -0.5, 0.06);
  g.add(board);

  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 32), orange);
  coin.rotation.x = Math.PI / 2;
  coin.position.set(-0.95, 0.7, 0.25);
  g.add(coin);

  return g;
}

function buildOrg() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a1c33, roughness: 0.9 });
  const b1 = new THREE.MeshStandardMaterial({ color: 0x15325a, roughness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86a27, roughness: 0.5 });
  const tex = makeWindowTexture();
  const win = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.1, 0.18, 48), dark);
  platform.position.y = -1.2;
  g.add(platform);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 1.1), win);
  tower.position.y = 0.15;
  g.add(tower);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), orange);
  roof.position.y = 1.62;
  g.add(roof);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), orange);
  antenna.position.y = 2.0;
  g.add(antenna);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.7, 0.85), b1);
  left.position.set(-1.18, -0.35, 0.1);
  g.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), win);
  right.position.set(1.18, -0.2, -0.1);
  g.add(right);

  // team nodes
  const node = new THREE.MeshStandardMaterial({ color: 0xe86a27, roughness: 0.4 });
  const nodeB = new THREE.MeshStandardMaterial({ color: 0x36a3ff, roughness: 0.4 });
  const positions = [
    [-0.9, 1.7, 0.5, node],
    [0, 2.05, 0.4, nodeB],
    [0.9, 1.7, 0.5, node],
  ];
  for (const [px, py, pz, mat] of positions) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), mat);
    s.position.set(px, py, pz);
    g.add(s);
  }

  return g;
}

export default function LicenseScene3D({ type = "personal", className = "" }) {
  const mountRef = React.useRef(null);
  const typeRef = React.useRef(type);
  const [supported, setSupported] = React.useState(true);

  React.useEffect(() => {
    typeRef.current = type;
  }, [type]);

  React.useEffect(() => {
    if (prefersReducedMotion() || !webglAvailable()) {
      setSupported(false);
      return undefined;
    }
    const mount = mountRef.current;
    if (!mount) return undefined;

    let width = mount.clientWidth || 320;
    let height = mount.clientHeight || 240;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 7);
    camera.lookAt(0, 0.5, 0);

    // Lighting: soft sky/ground ambient + a key, a cool fill and a warm rim.
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x0a1320, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(4, 7, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88b4ff, 0.45);
    fill.position.set(-4, 2, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe86a27, 0.7);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    const personal = buildPersonal();
    const org = buildOrg();
    scene.add(personal, org);

    // Soft contact shadow under the active model (static — doesn't rotate).
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 4.8),
      new THREE.MeshBasicMaterial({
        map: makeShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.28;
    scene.add(shadow);

    const startOrg = typeRef.current === "organization";
    let pScale = startOrg ? 0.001 : 1;
    let oScale = startOrg ? 1 : 0.001;

    const clock = new THREE.Clock();
    let raf = 0;
    function frame() {
      const t = clock.getElapsedTime();
      const isOrg = typeRef.current === "organization";
      pScale += ((isOrg ? 0 : 1) - pScale) * 0.1;
      oScale += ((isOrg ? 1 : 0) - oScale) * 0.1;
      personal.scale.setScalar(Math.max(0.001, pScale));
      org.scale.setScalar(Math.max(0.001, oScale));
      personal.visible = pScale > 0.02;
      org.visible = oScale > 0.02;
      const active = isOrg ? org : personal;
      active.rotation.y = t * 0.4;
      active.position.y = Math.sin(t * 1.1) * 0.05;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    frame();

    const ro = new ResizeObserver(() => {
      width = mount.clientWidth;
      height = mount.clientHeight;
      if (width && height) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            if (m.emissiveMap) m.emissiveMap.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Fallback to the lightweight SVG scene when 3D isn't available.
  if (!supported) return <LicenseScene type={type} className={className} />;

  return (
    <div className={`license-stage ${className}`}>
      <div
        ref={mountRef}
        className="license-stage__inner license-stage__canvas"
        role="img"
        aria-label={
          type === "organization"
            ? "3D illustration of a corporate organization"
            : "3D illustration of an individual quantity surveyor"
        }
      />
      <span className="license-stage__chip">
        {type === "organization" ? "Organization plan" : "Personal plan"}
      </span>
    </div>
  );
}
