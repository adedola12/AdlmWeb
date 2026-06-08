// src/lib/ifcViewer.js
//
// A small, self-contained IFC 3D viewer built on web-ifc (geometry) + three.js
// (rendering). It reuses the same web-ifc instance the upload gate uses
// (getIfcApi) so the wasm is only initialized once.
//
// The whole point of this viewer is the Element-ID link: every mesh is tagged
// with the Revit Element ID (the IFC `Tag`), so a BoQ line's `elementIds` can
// be highlighted in 3D and a clicked element can be traced back to its BoQ
// lines.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getIfcApi } from "./ifcElements.js";

const HIGHLIGHT_COLOR = new THREE.Color(0xf97316); // orange-500
const HIGHLIGHT_EMISSIVE = new THREE.Color(0x7c2d12);
const DIM_OPACITY = 0.16;

export class IfcViewer {
  constructor(container) {
    this.container = container;
    this.onPick = null; // (elementId:number) => void
    this._disposed = false;
    this.meshesByElementId = new Map(); // elementId -> THREE.Mesh[]

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef2f6); // slate-ish

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1e6);
    this.camera.position.set(30, 30, 30);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d99ae, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(50, 80, 30);
    this.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-40, 30, -50);
    this.scene.add(dir2);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this._onResize = this._handleResize.bind(this);
    window.addEventListener("resize", this._onResize);
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._handleResize());
      this._ro.observe(container);
    }
    this._onClick = this._handleClick.bind(this);
    this.renderer.domElement.addEventListener("click", this._onClick);

    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  async loadFromUrl(url, onProgress) {
    // R2 objects are public-read; omit credentials to avoid a CORS preflight.
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`Couldn't download the model (HTTP ${res.status}).`);
    const buf = await res.arrayBuffer();
    await this.loadFromBuffer(buf, onProgress);
  }

  async loadFromBuffer(arrayBuffer, onProgress) {
    const api = await getIfcApi();
    const modelID = api.OpenModel(new Uint8Array(arrayBuffer), {
      COORDINATE_TO_ORIGIN: true,
    });
    try {
      let processed = 0;
      api.StreamAllMeshes(modelID, (flatMesh, _i, total) => {
        if (this._disposed) return;
        const expressID = flatMesh.expressID;
        const elementId = this._readTag(api, modelID, expressID);
        const placed = flatMesh.geometries;
        const count = placed.size();
        for (let j = 0; j < count; j += 1) {
          const pg = placed.get(j);
          const mesh = this._meshFromPlacedGeometry(api, modelID, pg);
          if (!mesh) continue;
          mesh.userData.elementId = elementId;
          mesh.userData.expressID = expressID;
          this.modelGroup.add(mesh);
          if (elementId) {
            const arr = this.meshesByElementId.get(elementId);
            if (arr) arr.push(mesh);
            else this.meshesByElementId.set(elementId, [mesh]);
          }
        }
        processed += 1;
        if (onProgress && total) onProgress(processed / total);
      });
    } finally {
      try {
        api.CloseModel(modelID);
      } catch {
        /* ignore */
      }
    }
    this._fitToScene();
  }

  _readTag(api, modelID, expressID) {
    try {
      const line = api.GetLine(modelID, expressID);
      const raw = line?.Tag?.value;
      if (raw == null) return 0;
      const id = Number(String(raw).trim());
      return Number.isFinite(id) && id > 0 ? id : 0;
    } catch {
      return 0;
    }
  }

  _meshFromPlacedGeometry(api, modelID, pg) {
    let geom;
    try {
      geom = api.GetGeometry(modelID, pg.geometryExpressID);
    } catch {
      return null;
    }
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const indices = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    const numVerts = verts.length / 6;
    // Copy out of wasm memory into our own buffers (the views become invalid
    // once the model is closed).
    const positions = new Float32Array(numVerts * 3);
    const normals = new Float32Array(numVerts * 3);
    for (let i = 0; i < numVerts; i += 1) {
      positions[i * 3] = verts[i * 6];
      positions[i * 3 + 1] = verts[i * 6 + 1];
      positions[i * 3 + 2] = verts[i * 6 + 2];
      normals[i * 3] = verts[i * 6 + 3];
      normals[i * 3 + 1] = verts[i * 6 + 4];
      normals[i * 3 + 2] = verts[i * 6 + 5];
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    bg.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    bg.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    const c = pg.color || { x: 0.6, y: 0.6, z: 0.6, w: 1 };
    const transparent = c.w < 0.98;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(c.x, c.y, c.z),
      side: THREE.DoubleSide,
      transparent,
      opacity: c.w,
    });
    const mesh = new THREE.Mesh(bg, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.fromArray(pg.flatTransformation);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.userData.baseColor = material.color.clone();
    mesh.userData.baseOpacity = c.w;
    mesh.userData.baseTransparent = transparent;
    return mesh;
  }

  /** Highlight the meshes for the given Element IDs; dim the rest. */
  highlight(elementIds) {
    const ids = new Set(
      (elementIds || [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    const hasSelection = ids.size > 0;
    this.modelGroup.traverse((obj) => {
      if (!obj.isMesh) return;
      const mat = obj.material;
      if (hasSelection && ids.has(obj.userData.elementId)) {
        mat.color.copy(HIGHLIGHT_COLOR);
        if (mat.emissive) mat.emissive.copy(HIGHLIGHT_EMISSIVE);
        mat.transparent = false;
        mat.opacity = 1;
      } else {
        mat.color.copy(obj.userData.baseColor);
        if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
        mat.transparent = hasSelection ? true : obj.userData.baseTransparent;
        mat.opacity = hasSelection ? DIM_OPACITY : obj.userData.baseOpacity;
      }
      mat.needsUpdate = true;
    });
    if (hasSelection) this._frameElements(ids);
  }

  clearHighlight() {
    this.highlight([]);
  }

  /** Count how many of the given Element IDs actually exist in this model. */
  countPresent(elementIds) {
    let n = 0;
    for (const id of elementIds || []) {
      if (this.meshesByElementId.has(Number(id))) n += 1;
    }
    return n;
  }

  _frameElements(idSet) {
    const box = new THREE.Box3();
    let any = false;
    this.modelGroup.traverse((obj) => {
      if (obj.isMesh && idSet.has(obj.userData.elementId)) {
        obj.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(obj);
        if (!b.isEmpty()) {
          box.union(b);
          any = true;
        }
      }
    });
    if (any) this._frameBox(box, 1.8);
  }

  _fitToScene() {
    this.modelGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (!box.isEmpty()) this._frameBox(box, 1.3);
  }

  _frameBox(box, factor = 1.4) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 10;
    const dist =
      (maxDim * factor) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    this.camera.near = Math.max(dist / 1000, 0.01);
    this.camera.far = dist * 1000;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  _handleClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this.modelGroup.children, false);
    const hit = hits.find((h) => h.object?.userData?.elementId);
    if (this.onPick) this.onPick(hit ? hit.object.userData.elementId : 0);
  }

  _handleResize() {
    if (this._disposed) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop() {
    if (this._disposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._loop);
  }

  dispose() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    if (this._ro) this._ro.disconnect();
    this.renderer.domElement.removeEventListener("click", this._onClick);
    this.modelGroup.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      }
    });
    this.meshesByElementId.clear();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
