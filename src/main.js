import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 天蓝色背景

// 相机
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

// 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 光照
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

// 立方体（代表小车）
const cubeGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.y = 0.1; // 放在雪地上方
cube.castShadow = true;
scene.add(cube);

// 雪地参数
const snowSize = 20;
const snowSegments = 100;
const subdivision = snowSize / snowSegments;

// 创建雪地
const snowGeometry = new THREE.PlaneGeometry(snowSize, snowSize, snowSegments, snowSegments);
snowGeometry.rotateX(-Math.PI / 2); // 使平面朝上

// 创建顶点颜色属性
const colors = new Float32Array(snowGeometry.attributes.position.count * 3);
for (let i = 0; i < colors.length; i++) {
  colors[i] = 1; // 白色 (1,1,1)
}
snowGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// 雪地材质 - 使用顶点颜色
const snowMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.8,
  metalness: 0.1,
  vertexColors: true // 启用顶点颜色
});

const snowPlane = new THREE.Mesh(snowGeometry, snowMaterial);
snowPlane.receiveShadow = true;
scene.add(snowPlane);

// 雪地顶点位置和法线数据
const positions = snowGeometry.attributes.position;
const count = positions.count;
const basePositions = new Float32Array(count * 3); // 原始位置
const baseNormals = new Float32Array(count * 3);   // 原始法线
const elevations = new Float32Array(count);        // 高度数据
const trackIntensity = new Float32Array(count*5000);    // 痕迹强度

// 保存原始位置和法线数据
for (let i = 0; i < count; i++) {
  basePositions[i * 3] = positions.getX(i);
  basePositions[i * 3 + 1] = positions.getY(i);
  basePositions[i * 3 + 2] = positions.getZ(i);

  baseNormals[i * 3] = 0;
  baseNormals[i * 3 + 1] = 1;
  baseNormals[i * 3 + 2] = 0;

  elevations[i] = 0;
  trackIntensity[i] = 0;
}

// 控制键
const keys = {
  w: false,
  a: false,
  s: false,
  d: false
};

// 键盘事件监听
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() in keys) {
    keys[e.key.toLowerCase()] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() in keys) {
    keys[e.key.toLowerCase()] = false;
  }
});

// 窗口大小调整
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 立方体移动速度
const speed = 0.05;

// 跟踪上一个位置
let lastPosition = new THREE.Vector3();

// 获取给定位置的网格顶点索引
function getVertexIndex(x, z) {
  // 将世界坐标转为网格索引
  const halfSize = snowSize / 2;
  const xIndex = Math.floor((x + halfSize) / subdivision);
  const zIndex = Math.floor((z + halfSize) / subdivision);

  // 确保索引在有效范围内
  const clampedXIndex = Math.max(0, Math.min(snowSegments, xIndex));
  const clampedZIndex = Math.max(0, Math.min(snowSegments, zIndex));

  return clampedZIndex * (snowSegments + 1) + clampedXIndex;
}

// 压低雪地并改变颜色
function pressSnow(x, z, radius = 0.5, depth = 0.1, colorIntensity = 0.6) {
  for (let i = 0; i < count; i++) {
    const vx = basePositions[i * 3];
    const vz = basePositions[i * 3 + 2];

    const distance = Math.sqrt((vx - x) ** 2 + (vz - z) ** 2);

    if (distance < radius) {
      // 计算基于距离的影响力
      const influence = 1 - (distance / radius);

      // 更新高度 - 只降低，不升高
      const newElevation = Math.min(elevations[i], -depth * influence);
      if (newElevation < elevations[i]) {
        elevations[i] = newElevation;
      }

      // 更新痕迹强度 - 只增加，不减少
      const newIntensity = Math.max(trackIntensity[i], colorIntensity * influence);
      if (newIntensity > trackIntensity[i]) {
        trackIntensity[i] = newIntensity;
      }
    }
  }

  // 更新几何体
  updateSnowGeometry();
}

// 更新雪地几何体顶点、法线和颜色
function updateSnowGeometry() {
  const positionAttribute = snowGeometry.attributes.position;
  const normalAttribute = snowGeometry.attributes.normal;
  const colorAttribute = snowGeometry.attributes.color;

  // 应用高度变形和更新颜色
  for (let i = 0; i < count; i++) {
    // 设置新的高度
    positionAttribute.setY(i, basePositions[i * 3 + 1] + elevations[i]);

    // 更新颜色 - 雪地痕迹为蓝灰色 (0.8, 0.85, 0.9)
    const intensity = trackIntensity[i];
    const r = 1 - (intensity * 0.2);       // 减少红色
    const g = 1 - (intensity * 0.15);      // 稍微减少绿色
    const b = 1 - (intensity * 0.1);       // 少量减少蓝色

    colorAttribute.setXYZ(i, r, g, b);
  }

  // 计算新的法线
  for (let i = 0; i < count; i++) {
    const x = Math.floor(i % (snowSegments + 1));
    const z = Math.floor(i / (snowSegments + 1));

    // 寻找邻居
    let left = i, right = i, top = i, bottom = i;

    if (x > 0) left = i - 1;
    if (x < snowSegments) right = i + 1;
    if (z > 0) top = i - (snowSegments + 1);
    if (z < snowSegments) bottom = i + (snowSegments + 1);

    // 获取邻居顶点的位置
    const currentPos = new THREE.Vector3(
      positionAttribute.getX(i),
      positionAttribute.getY(i),
      positionAttribute.getZ(i)
    );

    const leftPos = new THREE.Vector3(
      positionAttribute.getX(left),
      positionAttribute.getY(left),
      positionAttribute.getZ(left)
    );

    const rightPos = new THREE.Vector3(
      positionAttribute.getX(right),
      positionAttribute.getY(right),
      positionAttribute.getZ(right)
    );

    const topPos = new THREE.Vector3(
      positionAttribute.getX(top),
      positionAttribute.getY(top),
      positionAttribute.getZ(top)
    );

    const bottomPos = new THREE.Vector3(
      positionAttribute.getX(bottom),
      positionAttribute.getY(bottom),
      positionAttribute.getZ(bottom)
    );

    // 创建方向向量
    const toRight = new THREE.Vector3().subVectors(rightPos, currentPos).normalize();
    const toBottom = new THREE.Vector3().subVectors(bottomPos, currentPos).normalize();
    const toLeft = new THREE.Vector3().subVectors(leftPos, currentPos).normalize();
    const toTop = new THREE.Vector3().subVectors(topPos, currentPos).normalize();

    // 计算法线
    const normal1 = new THREE.Vector3().crossVectors(toRight, toBottom).normalize();
    const normal2 = new THREE.Vector3().crossVectors(toBottom, toLeft).normalize();
    const normal3 = new THREE.Vector3().crossVectors(toLeft, toTop).normalize();
    const normal4 = new THREE.Vector3().crossVectors(toTop, toRight).normalize();

    // 平均法线
    const normal = new THREE.Vector3()
      .add(normal1)
      .add(normal2)
      .add(normal3)
      .add(normal4)
      .normalize();

    // 设置法线
    normalAttribute.setXYZ(i, normal.x, normal.y, normal.z);
  }

  // 标记需要更新
  positionAttribute.needsUpdate = true;
  normalAttribute.needsUpdate = true;
  colorAttribute.needsUpdate = true;
}

// 动画循环
function animate() {
  requestAnimationFrame(animate);

  // 更新控制
  if (keys.w) cube.position.z -= speed;
  if (keys.s) cube.position.z += speed;
  if (keys.a) cube.position.x -= speed;
  if (keys.d) cube.position.x += speed;

  // 限制在雪地范围内
  const limit = snowSize / 2 - 1;
  cube.position.x = Math.max(-limit, Math.min(limit, cube.position.x));
  cube.position.z = Math.max(-limit, Math.min(limit, cube.position.z));

  // 如果移动了，添加雪痕
  if (!cube.position.equals(lastPosition)) {
    // 每个车轮的位置（简化为立方体四个底角）
    const wheelRadius = 0.1;
    const wheelDepth = 0.08;
    const wheelOffset = 0.2;

    // 添加四个轮子的痕迹
    pressSnow(
      cube.position.x - wheelOffset,
      cube.position.z - wheelOffset,
      wheelRadius,
      wheelDepth,
      0.8
    );
    pressSnow(
      cube.position.x + wheelOffset,
      cube.position.z - wheelOffset,
      wheelRadius,
      wheelDepth,
      0.8
    );
    pressSnow(
      cube.position.x - wheelOffset,
      cube.position.z + wheelOffset,
      wheelRadius,
      wheelDepth,
      0.8
    );
    pressSnow(
      cube.position.x + wheelOffset,
      cube.position.z + wheelOffset,
      wheelRadius,
      wheelDepth,
      0.8
    );

    // 添加立方体底部中心的痕迹
    pressSnow(
      cube.position.x,
      cube.position.z,
      0.3,
      0.05,
      0.4
    );

    lastPosition.copy(cube.position);
  }

  // 更新轨道控制器
  controls.update();

  // 渲染场景
  renderer.render(scene, camera);
}

// 保存立方体初始位置
lastPosition.copy(cube.position);

// 开始动画循环
animate();
