import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

// ==========================================
// 1. CONFIGURATION & SHAPES
// ==========================================
const GRID_SIZE = 50;
const STUD_RADIUS = 0.22;
const STUD_HEIGHT = 0.15;
const BRICK_HEIGHT = 1.0; 

const COLORS = [
  { id: 'red', hex: '#E3000B', key: '1' },
  { id: 'blue', hex: '#0055BF', key: '2' },
  { id: 'yellow', hex: '#F6D105', key: '3' },
  { id: 'green', hex: '#237841', key: '4' },
  { id: 'white', hex: '#F4F4F4', key: '5' },
  { id: 'black', hex: '#111111', key: '6' },
  { id: 'tan', hex: '#D2CAB4', key: '7' }
];

const BASE_SHAPES = [
  { id: '1x1', w: 1, d: 1 },
  { id: '2x1', w: 2, d: 1 },
  { id: '2x2', w: 2, d: 2 },
  { id: '4x1', w: 4, d: 1 },
  { id: '4x2', w: 4, d: 2 },
  { id: '6x1', w: 6, d: 1 },
  { id: '8x1', w: 8, d: 1 },
  { id: '12x1', w: 12, d: 1 },
];

// ==========================================
// 2. GEOMETRY BUILDER (With Technic Holes)
// ==========================================
const createBrickGeometry = (w, d) => {
  const needsHolesX = (d === 1 && w > 1);
  const needsHolesZ = (w === 1 && d > 1);
  let baseGeo;

  if (needsHolesX || needsHolesZ) {
    const shapeW = needsHolesZ ? d : w; 
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(shapeW, 0);
    shape.lineTo(shapeW, BRICK_HEIGHT);
    shape.lineTo(0, BRICK_HEIGHT);
    shape.lineTo(0, 0);

    for (let i = 1; i < shapeW; i++) {
      const hole = new THREE.Path();
      hole.absarc(i, BRICK_HEIGHT / 2, 0.28, 0, Math.PI * 2, false);
      shape.holes.push(hole);
    }

    baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 16 });
    if (needsHolesZ) {
      baseGeo.rotateY(Math.PI / 2); 
      baseGeo.translate(0, 0, d); 
    }
  } else {
    baseGeo = new THREE.BoxGeometry(w, BRICK_HEIGHT, d);
    baseGeo.translate(w / 2, BRICK_HEIGHT / 2, d / 2); 
  }
  
  const studGeo = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16);
  const geometries = [baseGeo];

  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const clone = studGeo.clone();
      clone.translate(x + 0.5, BRICK_HEIGHT + (STUD_HEIGHT / 2), z + 0.5);
      geometries.push(clone);
    }
  }

  let totalVerts = 0, totalIndices = 0;
  geometries.forEach(g => {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices); 

  let vOffset = 0, iOffset = 0;
  geometries.forEach(g => {
    positions.set(g.attributes.position.array, vOffset * 3);
    normals.set(g.attributes.normal.array, vOffset * 3);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices[iOffset + i] = g.index.array[i] + vOffset;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) indices[iOffset + i] = i + vOffset;
    }
    vOffset += g.attributes.position.count;
    iOffset += g.index ? g.index.count : g.attributes.position.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
};

// ==========================================
// 3. MAIN REACT COMPONENT
// ==========================================
export default function LegoMinecraft() {
  const canvasRef = useRef(null);
  
  // UI State
  const [activeShapeIdx, setActiveShapeIdx] = useState(0);
  const [activeColorIdx, setActiveColorIdx] = useState(0); 
  const [isRotated, setIsRotated] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Engine Refs
  const stateRef = useRef({
    shape: BASE_SHAPES[0],
    color: COLORS[0].hex,
    rotated: false,
    grid: new Map(),
    input: { keys: {}, clicks: [], pitch: 0, yaw: 0 }
  });

  useEffect(() => {
    if (!canvasRef.current) return;

    // SCENE SETUP
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB'); // Sky blue
    scene.fog = new THREE.Fog('#87CEEB', 20, 100);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // CLASSIC GREY BASEPLATE
    const baseplateGeo = new THREE.BoxGeometry(GRID_SIZE, 1, GRID_SIZE);
    baseplateGeo.translate(GRID_SIZE / 2, -0.5, GRID_SIZE / 2); // Anchor 0,0,0
    const baseplateMat = new THREE.MeshLambertMaterial({ color: '#A3A2A4' }); // Classic light grey
    const baseplate = new THREE.Mesh(baseplateGeo, baseplateMat);
    scene.add(baseplate);

    // BASEPLATE STUDS (Instanced for performance)
    const studGeo = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 12);
    const studsMesh = new THREE.InstancedMesh(studGeo, baseplateMat, GRID_SIZE * GRID_SIZE);
    let studIndex = 0;
    const dummy = new THREE.Object3D();
    for(let x = 0; x < GRID_SIZE; x++) {
      for(let z = 0; z < GRID_SIZE; z++) {
        dummy.position.set(x + 0.5, STUD_HEIGHT / 2, z + 0.5);
        dummy.updateMatrix();
        studsMesh.setMatrixAt(studIndex++, dummy.matrix);
      }
    }
    scene.add(studsMesh);

    // CACHED GEOMETRIES & MATERIALS
    const geoCache = {};
    const getGeometry = (w, d) => {
      const key = `${w}x${d}`;
      if (!geoCache[key]) geoCache[key] = createBrickGeometry(w, d);
      return geoCache[key];
    };

    const matCache = {};
    COLORS.forEach(c => { matCache[c.hex] = new THREE.MeshLambertMaterial({ color: c.hex }); });

    const ghostMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    let ghostMesh = new THREE.Mesh(getGeometry(1, 1), ghostMat);
    scene.add(ghostMesh);

    const bricksGroup = new THREE.Group();
    scene.add(bricksGroup);

    // PLAYER PHYSICS
    const player = {
      pos: new THREE.Vector3(GRID_SIZE / 2, 5, GRID_SIZE / 2),
      vel: new THREE.Vector3(0, 0, 0),
      speed: 0.12,
      radius: 0.3,
      height: 1.6,
      onGround: false
    };

    // CORE LOGIC FUNCTIONS
    const getActiveDimensions = () => {
      const { shape, rotated } = stateRef.current;
      return rotated ? { w: shape.d, d: shape.w } : { w: shape.w, d: shape.d };
    };

    const checkCollision = (pos) => {
      const minX = Math.floor(pos.x - player.radius);
      const maxX = Math.floor(pos.x + player.radius);
      const minY = Math.floor(pos.y - player.height);
      const maxY = Math.floor(pos.y);
      const minZ = Math.floor(pos.z - player.radius);
      const maxZ = Math.floor(pos.z + player.radius);

      if (minY < 0) return true; // Baseplate bounds

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            if (stateRef.current.grid.has(`${x},${y},${z}`)) return true;
          }
        }
      }
      return false;
    };

    const placeBrick = (gridX, gridY, gridZ, w, d, colorHex) => {
      // Prevent building inside player
      const pMin = { x: player.pos.x - player.radius, y: player.pos.y - player.height, z: player.pos.z - player.radius };
      const pMax = { x: player.pos.x + player.radius, y: player.pos.y, z: player.pos.z + player.radius };
      
      const bMin = { x: gridX, y: gridY, z: gridZ };
      const bMax = { x: gridX + w, y: gridY + BRICK_HEIGHT, z: gridZ + d };

      if (pMin.x < bMax.x && pMax.x > bMin.x && 
          pMin.y < bMax.y && pMax.y > bMin.y && 
          pMin.z < bMax.z && pMax.z > bMin.z) return;

      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          stateRef.current.grid.set(`${gridX + x},${gridY},${gridZ + z}`, true);
        }
      }
      const mesh = new THREE.Mesh(getGeometry(w, d), matCache[colorHex]);
      mesh.position.set(gridX, gridY, gridZ);
      mesh.userData = { isBrick: true, gridX, gridY, gridZ, w, d };
      bricksGroup.add(mesh);
    };

    const removeBrick = (mesh) => {
      const { gridX, gridY, gridZ, w, d } = mesh.userData;
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          stateRef.current.grid.delete(`${gridX + x},${gridY},${gridZ + z}`);
        }
      }
      bricksGroup.remove(mesh);
    };

    // INPUT HANDLING
    const onKeyDown = (e) => {
      stateRef.current.input.keys[e.code] = true;
      if (e.code === 'KeyR') {
        setIsRotated(prev => { stateRef.current.rotated = !prev; return !prev; });
      }
      if (e.key >= '1' && e.key <= '7') {
        setActiveColorIdx(parseInt(e.key) - 1);
      }
    };
    
    const onKeyUp = (e) => { stateRef.current.input.keys[e.code] = false; };

    const onMouseMove = (e) => {
      if (document.pointerLockElement !== document.body) return;
      stateRef.current.input.yaw -= e.movementX * 0.002;
      stateRef.current.input.pitch -= e.movementY * 0.002;
      stateRef.current.input.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, stateRef.current.input.pitch));
    };

    const onMouseDown = (e) => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
        return;
      }
      // Left click (0) = Break, Right click (2) = Place
      stateRef.current.input.clicks.push(e.button === 0 ? 'left' : 'right');
    };

    const onWheel = (e) => {
      setActiveShapeIdx(prev => {
        let next = prev + Math.sign(e.deltaY);
        if (next < 0) next = BASE_SHAPES.length - 1;
        if (next >= BASE_SHAPES.length) next = 0;
        return next;
      });
    };

    const onPointerLockChange = () => setIsPlaying(document.pointerLockElement === document.body);
    const onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('wheel', onWheel);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvasRef.current.addEventListener('contextmenu', onContextMenu);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // RENDER LOOP
    const raycaster = new THREE.Raycaster();
    let frameId;

    const loop = () => {
      // 1. Camera & Movement
      camera.quaternion.setFromEuler(new THREE.Euler(stateRef.current.input.pitch, stateRef.current.input.yaw, 0, 'YXZ'));
      
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, stateRef.current.input.yaw, 0)).normalize();
      const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, stateRef.current.input.yaw, 0)).normalize();
      
      let moveX = 0, moveZ = 0;
      if (stateRef.current.input.keys['KeyW']) { moveX += forward.x; moveZ += forward.z; }
      if (stateRef.current.input.keys['KeyS']) { moveX -= forward.x; moveZ -= forward.z; }
      if (stateRef.current.input.keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
      if (stateRef.current.input.keys['KeyD']) { moveX += right.x; moveZ += right.z; }
      
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (length > 0) {
        moveX = (moveX / length) * player.speed;
        moveZ = (moveZ / length) * player.speed;
      }

      // X & Z Collisions
      player.pos.x += moveX;
      if (checkCollision(player.pos)) player.pos.x -= moveX;
      player.pos.z += moveZ;
      if (checkCollision(player.pos)) player.pos.z -= moveZ;

      // Y Collision & Gravity
      player.vel.y -= 0.015;
      if (stateRef.current.input.keys['Space'] && player.onGround) {
        player.vel.y = 0.25;
        player.onGround = false;
      }
      
      player.pos.y += player.vel.y;
      if (checkCollision(player.pos)) {
        if (player.vel.y < 0) { // Landing
           player.pos.y = Math.ceil(player.pos.y - player.height) + player.height;
           player.onGround = true;
        } else { // Hitting head
           player.pos.y = Math.floor(player.pos.y) - 0.001;
        }
        player.vel.y = 0;
      } else {
        player.onGround = false;
      }
      
      // Fallback baseplate floor bounds
      if (player.pos.y - player.height < 0) {
        player.pos.y = player.height;
        player.vel.y = 0;
        player.onGround = true;
      }

      camera.position.copy(player.pos);

      // 2. Raycasting & Building
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      raycaster.far = 8;
      const objects = [baseplate, ...bricksGroup.children];
      const intersects = raycaster.intersectObjects(objects);

      const dims = getActiveDimensions();
      let hitValid = false;

      if (intersects.length > 0) {
        const hit = intersects[0];
        hitValid = true;

        const placeNormal = hit.face.normal.clone();
        const point = hit.point.clone().add(placeNormal.clone().multiplyScalar(0.1));
        
        let hX = Math.floor(point.x);
        let hY = Math.floor(point.y);
        let hZ = Math.floor(point.z);

        // Process Clicks
        while (stateRef.current.input.clicks.length > 0) {
          const action = stateRef.current.input.clicks.shift();
          if (action === 'left' && hit.object !== baseplate) { // Break
            removeBrick(hit.object);
          } else if (action === 'right') { // Place
            placeBrick(hX, hY, hZ, dims.w, dims.d, stateRef.current.color);
          }
        }

        // Update Ghost Mesh
        ghostMesh.geometry = getGeometry(dims.w, dims.d);
        ghostMesh.position.set(hX, hY, hZ);
        
        // Simple overlap check for ghost coloring
        let willOverlap = false;
        for (let x = 0; x < dims.w; x++) {
          for (let z = 0; z < dims.d; z++) {
            if (stateRef.current.grid.has(`${hX + x},${hY},${hZ + z}`)) willOverlap = true;
          }
        }

        ghostMesh.material.color.setHex(willOverlap ? 0xff0000 : 0xffffff);
        ghostMesh.visible = true;
      } else {
        ghostMesh.visible = false;
        stateRef.current.input.clicks = []; // clear unhandled clicks
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.dispose();
    };
  }, []);

  // Sync React UI State to Engine
  useEffect(() => { stateRef.current.shape = BASE_SHAPES[activeShapeIdx]; }, [activeShapeIdx]);
  useEffect(() => { stateRef.current.color = COLORS[activeColorIdx].hex; }, [activeColorIdx]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000', userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Crosshair */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        color: 'white', fontSize: '24px', pointerEvents: 'none', textShadow: '1px 1px 0 #000'
      }}>+</div>

      {/* Start/Pause Overlay */}
      {!isPlaying && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontFamily: 'sans-serif'
        }}>
          <h1 style={{ fontSize: '48px', margin: 0 }}>LEGO SURVIVAL</h1>
          <p style={{ fontSize: '20px' }}>Click anywhere to enter</p>
          <div style={{ marginTop: '20px', color: '#ccc', textAlign: 'center', lineHeight: '1.6' }}>
            <p><b>WASD</b> to Move | <b>Space</b> to Jump</p>
            <p><b>Right Click</b> to Place | <b>Left Click</b> to Break</p>
            <p><b>Scroll</b> to Change Shape | <b>1-7</b> to Change Color | <b>R</b> to Rotate</p>
          </div>
        </div>
      )}

      {/* HUD: Color Palette */}
      {isPlaying && (
        <div style={{
          position: 'absolute', top: 20, right: 20, display: 'flex', gap: '10px',
          background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px'
        }}>
          {COLORS.map((c, i) => (
            <div key={c.id} style={{ textAlign: 'center' }}>
              <div style={{
                width: '30px', height: '30px', backgroundColor: c.hex,
                border: `3px solid ${activeColorIdx === i ? '#fff' : '#222'}`, borderRadius: '4px'
              }} />
              <div style={{ color: 'white', fontSize: '12px', marginTop: '4px', fontFamily: 'monospace' }}>
                [{c.key}]
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HUD: Shape Selector */}
      {isPlaying && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '12px',
          borderRadius: '12px', alignItems: 'flex-end'
        }}>
          {BASE_SHAPES.map((shape, i) => (
            <div key={shape.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
              <div style={{
                width: `${shape.w * 10}px`, height: `${shape.d * 10}px`,
                backgroundColor: '#ccc', border: `2px solid ${activeShapeIdx === i ? '#4FC3F7' : '#444'}`,
                borderRadius: '2px', transition: 'all 0.1s'
              }} />
              <span style={{ 
                color: activeShapeIdx === i ? '#4FC3F7' : 'white', 
                fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold' 
              }}>
                {isRotated && activeShapeIdx === i ? `${shape.d}x${shape.w}` : shape.id}
              </span>
            </div>
          ))}
          <div style={{
             marginLeft: '15px', padding: '8px', background: isRotated ? '#4FC3F7' : '#444',
             color: isRotated ? 'black' : 'white', borderRadius: '4px', fontFamily: 'sans-serif',
             fontWeight: 'bold', fontSize: '12px'
          }}>
             [R] Rotated
          </div>
        </div>
      )}
    </div>
  );
}