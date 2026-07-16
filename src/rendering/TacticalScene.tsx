import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { Simulation } from "../simulation/Simulation";
import { lerp, normalize, sub } from "../simulation/math";
import type { MissileTrailMode, Ship, Vec3 } from "../simulation/types";

interface TacticalSceneProps {
  simulation: Simulation;
  tacticalOverlay: boolean;
  missileTrailMode: MissileTrailMode;
  onMoveDirection: (direction: Vec3) => void;
}

const toThree = (value: Vec3): THREE.Vector3 =>
  new THREE.Vector3(value.x, value.y, value.z);

function interpolateMotion(
  previousPosition: Vec3,
  position: Vec3,
  previousVelocity: Vec3,
  velocity: Vec3,
  phase: number,
): Vec3 {
  const t = THREE.MathUtils.clamp(phase, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return {
    x:
      h00 * previousPosition.x +
      h10 * previousVelocity.x +
      h01 * position.x +
      h11 * velocity.x,
    y:
      h00 * previousPosition.y +
      h10 * previousVelocity.y +
      h01 * position.y +
      h11 * velocity.y,
    z:
      h00 * previousPosition.z +
      h10 * previousVelocity.z +
      h01 * position.z +
      h11 * velocity.z,
  };
}

function createSkyboxTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d")!;

  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, "#03080d");
  base.addColorStop(0.42, "#080b0d");
  base.addColorStop(0.7, "#100b09");
  base.addColorStop(1, "#020405");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const paintCloud = (x: number, y: number, radius: number, inner: string) => {
    const cloud = context.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, inner);
    cloud.addColorStop(0.34, inner.replace(/[^,]+\)$/, "0.12)"));
    cloud.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = cloud;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  paintCloud(460, 510, 570, "rgba(102,62,31,0.28)");
  paintCloud(1500, 380, 630, "rgba(23,67,79,0.25)");
  paintCloud(1910, 760, 430, "rgba(81,35,24,0.22)");

  let seed = 0x51_f1_9e;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
  for (let index = 0; index < 2100; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const size = random() > 0.985 ? 1.8 : random() * 0.9 + 0.25;
    const warmth = random();
    context.fillStyle =
      warmth > 0.86
        ? `rgba(255,205,156,${0.42 + random() * 0.45})`
        : warmth < 0.12
          ? `rgba(151,214,255,${0.4 + random() * 0.48})`
          : `rgba(232,235,224,${0.3 + random() * 0.6})`;
    context.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createBracketTexture(
  color: string,
  role: "player" | "fc" | "member",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, 128, 128);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = role === "member" ? 5.5 : 7;
  context.lineCap = "square";
  context.shadowColor = color;
  context.shadowBlur = role === "member" ? 13 : 20;

  const inset = role === "member" ? 22 : 16;
  const length = role === "member" ? 24 : 30;
  const far = 128 - inset;
  const drawCorner = (
    x: number,
    y: number,
    horizontal: number,
    vertical: number,
  ) => {
    context.beginPath();
    context.moveTo(x + horizontal * length, y);
    context.lineTo(x, y);
    context.lineTo(x, y + vertical * length);
    context.stroke();
  };
  drawCorner(inset, inset, 1, 1);
  drawCorner(far, inset, -1, 1);
  drawCorner(inset, far, 1, -1);
  drawCorner(far, far, -1, -1);

  if (role === "fc") {
    context.beginPath();
    context.moveTo(64, 5);
    context.lineTo(73, 15);
    context.lineTo(64, 25);
    context.lineTo(55, 15);
    context.closePath();
    context.stroke();
  } else if (role === "player") {
    context.beginPath();
    context.arc(64, 64, 15, 0, Math.PI * 2);
    context.stroke();
    context.fillRect(61, 3, 6, 12);
  } else {
    context.beginPath();
    context.moveTo(64, 49);
    context.lineTo(74, 64);
    context.lineTo(64, 79);
    context.lineTo(54, 64);
    context.closePath();
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addRangeRing(
  scene: THREE.Scene,
  radius: number,
  color: number,
  opacity: number,
): void {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    points.push(
      new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  scene.add(new THREE.LineLoop(geometry, material));
}

function setInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  ship: Ship,
  position: THREE.Vector3,
  direction: THREE.Vector3,
  color: THREE.Color,
): void {
  const matrix = new THREE.Matrix4();
  const yaw = Math.atan2(direction.x, direction.z);
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, yaw, 0),
  );
  const scaleAmount = ship.role === "fc" ? 1.25 : 0.82;
  matrix.compose(
    position,
    quaternion,
    new THREE.Vector3(scaleAmount, scaleAmount, scaleAmount),
  );
  mesh.setMatrixAt(index, matrix);
  mesh.setColorAt(index, color);
}

export function TacticalScene({
  simulation,
  tacticalOverlay,
  missileTrailMode,
  onMoveDirection,
}: TacticalSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef(tacticalOverlay);
  const trailModeRef = useRef(missileTrailMode);
  const moveRef = useRef(onMoveDirection);

  useEffect(() => {
    overlayRef.current = tacticalOverlay;
  }, [tacticalOverlay]);

  useEffect(() => {
    trailModeRef.current = missileTrailMode;
  }, [missileTrailMode]);

  useEffect(() => {
    moveRef.current = onMoveDirection;
  }, [onMoveDirection]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030506);
    scene.fog = new THREE.FogExp2(0x030506, 0.0000028);

    const camera = new THREE.PerspectiveCamera(46, 1, 100, 500000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "Three-dimensional tactical battlefield",
    );
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x98d8ff, 0x071017, 1.4));
    const key = new THREE.DirectionalLight(0xd8f3ff, 2.2);
    key.position.set(22000, 36000, -18000);
    scene.add(key);

    const starGeometry = new THREE.BufferGeometry();
    const stars = new Float32Array(2200 * 3);
    let starSeed = 0x31415926;
    const starRandom = () => {
      starSeed ^= starSeed << 13;
      starSeed ^= starSeed >>> 17;
      starSeed ^= starSeed << 5;
      return (starSeed >>> 0) / 0x1_0000_0000;
    };
    for (let index = 0; index < stars.length; index += 3) {
      stars[index] = (starRandom() - 0.5) * 420000;
      stars[index + 1] = (starRandom() - 0.5) * 250000;
      stars[index + 2] = (starRandom() - 0.5) * 420000;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xd6d1bf,
      size: 125,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(starGeometry, starMaterial));

    const skyboxTexture = createSkyboxTexture();
    const skybox = new THREE.Mesh(
      new THREE.SphereGeometry(285000, 48, 24),
      new THREE.MeshBasicMaterial({
        map: skyboxTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    skybox.frustumCulled = false;
    skybox.renderOrder = -100;
    scene.add(skybox);

    const overlayGroup = new THREE.Group();
    [5000, 10000, 20000, 30000, 50000, 75000, 100000].forEach((radius, index) =>
      addRangeRing(
        overlayGroup as unknown as THREE.Scene,
        radius,
        index < 3 ? 0x78827e : 0x4b5652,
        index < 3 ? 0.2 : 0.11,
      ),
    );
    const grid = new THREE.GridHelper(200000, 40, 0x69736f, 0x303a37);
    grid.material.transparent = true;
    grid.material.opacity = 0.1;
    overlayGroup.add(grid);
    scene.add(overlayGroup);

    const shipGeometry = new THREE.ConeGeometry(390, 1200, 7);
    shipGeometry.translate(0, 250, 0);
    const friendlyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.64,
      metalness: 0.68,
      emissive: 0x061219,
      vertexColors: true,
    });
    const hostileMaterial = friendlyMaterial.clone();
    const friendlyMesh = new THREE.InstancedMesh(
      shipGeometry,
      friendlyMaterial,
      12,
    );
    const hostileMesh = new THREE.InstancedMesh(
      shipGeometry,
      hostileMaterial,
      64,
    );
    friendlyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hostileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(friendlyMesh, hostileMesh);

    const playerGeometry: THREE.BufferGeometry = new THREE.OctahedronGeometry(
      900,
      0,
    );
    const playerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4e3bd,
      emissive: 0x4a3618,
      emissiveIntensity: 0.5,
      metalness: 0.78,
      roughness: 0.35,
    });
    const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.scale.set(1.35, 0.56, 2.2);
    scene.add(playerMesh);
    let sceneDisposed = false;
    const stlLoader = new STLLoader();
    stlLoader.load(
      `${import.meta.env.BASE_URL}models/Nestor.stl`,
      (geometry) => {
        if (sceneDisposed) {
          geometry.dispose();
          return;
        }
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox?.getSize(size);
        if (size.x >= size.y && size.x >= size.z) geometry.rotateY(Math.PI / 2);
        else if (size.y >= size.x && size.y >= size.z)
          geometry.rotateX(Math.PI / 2);
        geometry.center();
        geometry.computeBoundingBox();
        geometry.boundingBox?.getSize(size);
        const modelScale = 3600 / Math.max(1, size.x, size.y, size.z);
        geometry.scale(modelScale, modelScale, modelScale);
        geometry.computeVertexNormals();
        playerMesh.geometry.dispose();
        playerMesh.geometry = geometry;
        playerMesh.scale.set(1, 1, 1);
      },
      undefined,
      () => {
        playerMesh.material = playerMaterial;
      },
    );

    const bracketTextures = new Map<string, THREE.CanvasTexture>();
    const bracketSprites = new Map<string, THREE.Sprite>();
    const bracketColor = (ship: Ship): string => {
      if (ship.alignment === "player") return "#f6d78d";
      if (ship.alignment === "friendly")
        return ship.role === "fc" ? "#9af5ff" : "#49c8f4";
      return (
        simulation.world.fleets.find((fleet) => fleet.id === ship.fleetId)
          ?.color ?? "#ff665d"
      );
    };
    for (const ship of [simulation.world.player, ...simulation.world.ships]) {
      const color = bracketColor(ship);
      const textureKey = `${color}-${ship.role}`;
      let texture = bracketTextures.get(textureKey);
      if (!texture) {
        texture = createBracketTexture(color, ship.role);
        bracketTextures.set(textureKey, texture);
      }
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: ship.role === "member" ? 0.94 : 1,
        alphaTest: 0.03,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 40;
      scene.add(sprite);
      bracketSprites.set(ship.id, sprite);
    }

    const missileGeometry = new THREE.BufferGeometry();
    const missilePositions = new Float32Array(2200 * 3);
    const missileColors = new Float32Array(2200 * 3);
    missileGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(missilePositions, 3),
    );
    missileGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(missileColors, 3),
    );
    missileGeometry.setDrawRange(0, 0);
    const missileMaterial = new THREE.PointsMaterial({
      size: 400,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.86,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const missilePoints = new THREE.Points(missileGeometry, missileMaterial);
    scene.add(missilePoints);

    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(2200 * 2 * 3);
    const trailColors = new Float32Array(2200 * 2 * 3);
    trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(trailPositions, 3),
    );
    trailGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(trailColors, 3),
    );
    trailGeometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.26,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trails = new THREE.LineSegments(trailGeometry, trailMaterial);
    scene.add(trails);

    const corridorMeshes = Array.from({ length: 3 }, () => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff6b5f,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
        material,
      );
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });
    const displayedCorridors = corridorMeshes.map(() => ({
      initialized: false,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
    }));

    const idealRegion = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0x73f6c5,
        wireframe: true,
        transparent: true,
        opacity: 0.56,
      }),
    );
    const displayedIdealPosition = toThree(
      simulation.world.analysis.idealPosition,
    );
    const displayedShipPositions = new Map<string, THREE.Vector3>();
    const displayedShipDirections = new Map<string, THREE.Vector3>();
    idealRegion.position.copy(displayedIdealPosition);
    scene.add(idealRegion);

    const exclusion = new THREE.Mesh(
      new THREE.SphereGeometry(9500, 22, 14),
      new THREE.MeshBasicMaterial({
        color: 0x36a9df,
        transparent: true,
        opacity: 0.045,
        wireframe: true,
        depthWrite: false,
      }),
    );
    scene.add(exclusion);

    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1050, 1280, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf5f8d6,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    selectionRing.rotation.x = -Math.PI / 2;
    scene.add(selectionRing);

    const effectMeshes = new Map<string, THREE.Mesh>();
    const orbit = { yaw: 0.52, pitch: 0.72, distance: 76000 };
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      orbit.yaw -= (event.clientX - pointerX) * 0.005;
      orbit.pitch = THREE.MathUtils.clamp(
        orbit.pitch + (event.clientY - pointerY) * 0.004,
        0.18,
        1.42,
      );
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbit.distance = THREE.MathUtils.clamp(
        orbit.distance * (1 + event.deltaY * 0.001),
        12000,
        190000,
      );
    };
    const onDoubleClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      const target = new THREE.Vector3();
      if (
        ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
          target,
        )
      ) {
        const player = simulation.world.player.position;
        moveRef.current(sub({ x: target.x, y: target.y, z: target.z }, player));
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("dblclick", onDoubleClick);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const tempColor = new THREE.Color();
    const yAxis = new THREE.Vector3(0, 1, 0);
    let frameHandle = 0;
    let lastRenderTime = performance.now();
    const renderFrame = (now = performance.now()) => {
      const frameDelta = Math.min(0.05, (now - lastRenderTime) / 1000);
      const displaySmoothing = 1 - Math.exp(-frameDelta * 9);
      const shipPositionSmoothing = 1 - Math.exp(-frameDelta * 18);
      const shipDirectionSmoothing = 1 - Math.exp(-frameDelta * 10);
      const cameraSmoothing = 1 - Math.exp(-frameDelta * 7.5);
      lastRenderTime = now;
      const world = simulation.world;
      const phase = simulation.clock.phase;
      const frameMotions = new Map<
        string,
        { position: THREE.Vector3; direction: THREE.Vector3 }
      >();
      const displayedMotion = (ship: Ship) => {
        const cached = frameMotions.get(ship.id);
        if (cached) return cached;
        const targetPosition = toThree(
          interpolateMotion(
            ship.previousPosition,
            ship.position,
            ship.previousVelocity,
            ship.velocity,
            phase,
          ),
        );
        let position = displayedShipPositions.get(ship.id);
        if (!position) {
          position = targetPosition.clone();
          displayedShipPositions.set(ship.id, position);
        } else if (position.distanceToSquared(targetPosition) > 20_000 ** 2) {
          position.copy(targetPosition);
        } else {
          position.lerp(targetPosition, shipPositionSmoothing);
        }

        const velocityDirection =
          lengthSq(ship.velocity) > 1
            ? normalize(lerp(ship.previousVelocity, ship.velocity, phase))
            : normalize(ship.desiredDirection);
        const targetDirection = toThree(velocityDirection);
        let direction = displayedShipDirections.get(ship.id);
        if (!direction) {
          direction = targetDirection.clone();
          displayedShipDirections.set(ship.id, direction);
        } else if (targetDirection.lengthSq() > 0.0001) {
          direction.lerp(targetDirection, shipDirectionSmoothing).normalize();
        }
        const motion = { position, direction };
        frameMotions.set(ship.id, motion);
        return motion;
      };

      const playerMotion = displayedMotion(world.player);
      const playerPosition = playerMotion.position;
      playerMesh.position.copy(playerPosition);
      if (lengthSq(world.player.velocity) > 1) {
        playerMesh.rotation.y = Math.atan2(
          playerMotion.direction.x,
          playerMotion.direction.z,
        );
      }

      let friendlyIndex = 0;
      let hostileIndex = 0;
      for (const ship of world.ships) {
        if (!ship.visible) continue;
        const motion = displayedMotion(ship);
        if (ship.alignment === "friendly") {
          setInstance(
            friendlyMesh,
            friendlyIndex,
            ship,
            motion.position,
            motion.direction,
            tempColor.set(ship.role === "fc" ? "#9af5ff" : "#4ab9e8"),
          );
          friendlyIndex += 1;
        } else if (ship.alignment === "hostile") {
          const fleet = world.fleets.find((item) => item.id === ship.fleetId);
          setInstance(
            hostileMesh,
            hostileIndex,
            ship,
            motion.position,
            motion.direction,
            tempColor.set(fleet?.color ?? "#ff6b5f"),
          );
          hostileIndex += 1;
        }
      }
      friendlyMesh.count = friendlyIndex;
      hostileMesh.count = hostileIndex;
      friendlyMesh.instanceMatrix.needsUpdate = true;
      hostileMesh.instanceMatrix.needsUpdate = true;
      if (friendlyMesh.instanceColor)
        friendlyMesh.instanceColor.needsUpdate = true;
      if (hostileMesh.instanceColor)
        hostileMesh.instanceColor.needsUpdate = true;

      for (const ship of [world.player, ...world.ships]) {
        const bracket = bracketSprites.get(ship.id);
        if (!bracket) continue;
        bracket.visible = ship.visible && ship.hp > 0;
        if (!bracket.visible) continue;
        bracket.position.copy(displayedMotion(ship).position);
        bracket.position.y += ship.role === "player" ? 420 : 260;
        const cameraDistance = camera.position.distanceTo(bracket.position);
        const baseScale = THREE.MathUtils.clamp(
          cameraDistance * 0.03,
          1150,
          5200,
        );
        const emphasis =
          world.selectedId === ship.id
            ? 1.55
            : ship.role === "player"
              ? 1.32
              : ship.role === "fc"
                ? 1.22
                : 1;
        bracket.scale.set(baseScale * emphasis, baseScale * emphasis, 1);
        (bracket.material as THREE.SpriteMaterial).opacity =
          world.selectedId === ship.id ? 1 : ship.role === "member" ? 0.92 : 1;
      }

      const enhancedTrails = trailModeRef.current === "enhanced";
      missileMaterial.size = enhancedTrails ? 620 : 400;
      missileMaterial.opacity = enhancedTrails ? 1 : 0.86;
      trailMaterial.opacity = enhancedTrails ? 0.78 : 0.26;

      const missileCount = Math.min(world.missiles.length, 2200);
      for (let index = 0; index < missileCount; index += 1) {
        const missile = world.missiles[index]!;
        const position = interpolateMotion(
          missile.previousPosition,
          missile.position,
          missile.previousVelocity,
          missile.velocity,
          phase,
        );
        missilePositions[index * 3] = position.x;
        missilePositions[index * 3 + 1] = position.y;
        missilePositions[index * 3 + 2] = position.z;
        const color = tempColor.set(
          world.fleets.find((fleet) => fleet.id === missile.fleetId)?.color ??
            "#ff836f",
        );
        missileColors[index * 3] = color.r;
        missileColors[index * 3 + 1] = color.g;
        missileColors[index * 3 + 2] = color.b;
      }
      missileGeometry.setDrawRange(0, missileCount);
      missileGeometry.attributes.position!.needsUpdate = true;
      missileGeometry.attributes.color!.needsUpdate = true;

      const trailCount = Math.min(
        world.missiles.length,
        enhancedTrails ? 1800 : 700,
      );
      for (let index = 0; index < trailCount; index += 1) {
        const missile = world.missiles[index]!;
        const base = index * 6;
        const trailEnd = interpolateMotion(
          missile.previousPosition,
          missile.position,
          missile.previousVelocity,
          missile.velocity,
          phase,
        );
        const trailDirection = normalize(
          lerp(missile.previousVelocity, missile.velocity, phase),
        );
        const trailLength = enhancedTrails
          ? THREE.MathUtils.clamp(missile.maxVelocity * 0.52, 1800, 6200)
          : THREE.MathUtils.clamp(missile.maxVelocity * 0.14, 500, 1600);
        trailPositions[base] = trailEnd.x - trailDirection.x * trailLength;
        trailPositions[base + 1] = trailEnd.y - trailDirection.y * trailLength;
        trailPositions[base + 2] = trailEnd.z - trailDirection.z * trailLength;
        trailPositions[base + 3] = trailEnd.x;
        trailPositions[base + 4] = trailEnd.y;
        trailPositions[base + 5] = trailEnd.z;
        const trailColor = tempColor.set(
          world.fleets.find((fleet) => fleet.id === missile.fleetId)?.color ??
            "#ff836f",
        );
        trailColors[base] = trailColor.r * 0.16;
        trailColors[base + 1] = trailColor.g * 0.16;
        trailColors[base + 2] = trailColor.b * 0.16;
        trailColors[base + 3] = trailColor.r;
        trailColors[base + 4] = trailColor.g;
        trailColors[base + 5] = trailColor.b;
      }
      trailGeometry.setDrawRange(0, trailCount * 2);
      trailGeometry.attributes.position!.needsUpdate = true;
      trailGeometry.attributes.color!.needsUpdate = true;

      overlayGroup.visible = overlayRef.current;
      idealRegion.visible =
        overlayRef.current &&
        world.scenario.assistance !== "expert" &&
        world.scenario.assistance !== "minimal";
      exclusion.visible = overlayRef.current;
      displayedIdealPosition.lerp(
        toThree(world.analysis.idealPosition),
        displaySmoothing,
      );
      idealRegion.position.copy(displayedIdealPosition);
      exclusion.position.copy(playerPosition);

      corridorMeshes.forEach((mesh, index) => {
        const corridor = world.corridors[index];
        mesh.visible = Boolean(corridor && overlayRef.current);
        if (!corridor) return;
        const start = toThree(corridor.from);
        const end = toThree(corridor.to);
        const displayed = displayedCorridors[index]!;
        if (!displayed.initialized) {
          displayed.from.copy(start);
          displayed.to.copy(end);
          displayed.initialized = true;
        } else {
          displayed.from.lerp(start, displaySmoothing);
          displayed.to.lerp(end, displaySmoothing);
        }
        const direction = displayed.to.clone().sub(displayed.from);
        const corridorLength = direction.length();
        mesh.position.copy(
          displayed.from.clone().add(displayed.to).multiplyScalar(0.5),
        );
        mesh.quaternion.setFromUnitVectors(
          yAxis,
          direction.clone().normalize(),
        );
        mesh.scale.set(corridor.width, corridorLength, corridor.width);
        (mesh.material as THREE.MeshBasicMaterial).color.set(corridor.color);
        (mesh.material as THREE.MeshBasicMaterial).opacity = corridor.coverage
          ? 0.115
          : 0.055;
      });

      const selected =
        world.selectedId === "player"
          ? world.player
          : world.ships.find((ship) => ship.id === world.selectedId);
      selectionRing.visible = Boolean(selected?.visible);
      if (selected?.visible) {
        selectionRing.position.copy(displayedMotion(selected).position);
        selectionRing.position.y += 90;
      }

      for (const effect of world.effects) {
        if (effectMeshes.has(effect.id)) continue;
        const material = new THREE.MeshBasicMaterial({
          color: effect.color,
          transparent: true,
          opacity: effect.type === "smartbomb" ? 0.5 : 0.82,
          wireframe: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 18, 10),
          material,
        );
        mesh.position.copy(toThree(effect.position));
        scene.add(mesh);
        effectMeshes.set(effect.id, mesh);
      }
      for (const [id, mesh] of effectMeshes) {
        const effect = world.effects.find((item) => item.id === id);
        if (!effect) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          effectMeshes.delete(id);
          continue;
        }
        const age = world.tick - effect.tick + phase;
        const growth =
          effect.type === "smartbomb"
            ? clamp01(age / 0.85)
            : clamp01(age / 0.45);
        const radius = effect.radius * Math.max(0.08, growth);
        mesh.scale.setScalar(radius);
        (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
          0,
          0.62 * (1 - age / 2.1),
        );
      }

      const focus = playerPosition;
      const horizontal = Math.cos(orbit.pitch) * orbit.distance;
      const offset = new THREE.Vector3(
        Math.sin(orbit.yaw) * horizontal,
        Math.sin(orbit.pitch) * orbit.distance,
        Math.cos(orbit.yaw) * horizontal,
      );
      camera.position.lerp(focus.clone().add(offset), cameraSmoothing);
      camera.lookAt(focus);
      skybox.position.copy(camera.position);
      renderer.render(scene, camera);
      frameHandle = requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      sceneDisposed = true;
      cancelAnimationFrame(frameHandle);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material?.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      bracketTextures.forEach((texture) => texture.dispose());
      skyboxTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [simulation]);

  return (
    <div className="tactical-scene" ref={hostRef}>
      <div className="scene-reticle" aria-hidden="true" />
      <div className="space-instruction">
        DOUBLE-CLICK SPACE TO ALIGN · DRAG TO ORBIT · WHEEL TO ZOOM
      </div>
    </div>
  );
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lengthSq = (value: Vec3): number =>
  value.x ** 2 + value.y ** 2 + value.z ** 2;
