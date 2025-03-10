import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * 雪地系统类
 * 管理雪地表面及其变形效果
 */
class SnowFieldSystem {
    constructor(options = {}) {
        // 配置参数
        this.options = {
            size: options.size || 20,
            segments: options.segments || 100,
            color: options.color || 0xffffff,
            roughness: options.roughness || 0.8,
            metalness: options.metalness || 0.1,
            movementSpeed: options.movementSpeed || 0.05,
            scene: options.scene || null,
            camera: options.camera || null,
            controls: options.controls || null,
            renderer: options.renderer || null,
            debugObject: options.debugObject || null // 用于调试的可选对象
        };

        // 如果没有提供场景、相机、渲染器，就创建它们
        if (!this.options.scene) {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x87CEEB);
        } else {
            this.scene = this.options.scene;
        }

        if (!this.options.camera) {
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(5, 5, 5);
        } else {
            this.camera = this.options.camera;
        }

        if (!this.options.renderer) {
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            document.body.appendChild(this.renderer.domElement);
        } else {
            this.renderer = this.options.renderer;
        }

        if (!this.options.controls) {
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
        } else {
            this.controls = this.options.controls;
        }

        // 初始化
        this.init();
    }

    /**
     * 初始化雪地系统
     */
    init() {
        // 设置参数
        this.snowSize = this.options.size;
        this.snowSegments = this.options.segments;
        this.subdivision = this.snowSize / this.snowSegments;
        this.movementSpeed = this.options.movementSpeed;

        // 添加光照
        this.setupLights();

        // 创建雪地
        this.createSnowField();

        // 创建示例立方体（用户可以替换为自己的物体）
        this.createDebugCube();

        // 初始化控制
        this.initControls();

        // 初始化事件监听
        this.initEventListeners();

        // 保存立方体初始位置
        this.lastPosition = new THREE.Vector3();
        if (this.cube) this.lastPosition.copy(this.cube.position);

        // 开始动画循环
        this.animate();
    }

    /**
     * 设置场景光照
     */
    setupLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // 方向光
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
        this.scene.add(directionalLight);

        // 保存引用以便后续访问
        this.directionalLight = directionalLight;
    }

    /**
     * 创建雪地表面
     */
    createSnowField() {
        // 创建雪地几何体
        this.snowGeometry = new THREE.PlaneGeometry(
            this.snowSize,
            this.snowSize,
            this.snowSegments,
            this.snowSegments
        );
        this.snowGeometry.rotateX(-Math.PI / 2); // 使平面朝上

        // 创建顶点颜色属性
        const colors = new Float32Array(this.snowGeometry.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i++) {
            colors[i] = 1; // 白色 (1,1,1)
        }
        this.snowGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // 雪地材质 - 使用顶点颜色
        this.snowMaterial = new THREE.MeshStandardMaterial({
            color: this.options.color,
            roughness: this.options.roughness,
            metalness: this.options.metalness,
            vertexColors: true // 启用顶点颜色
        });

        // 创建雪地网格
        this.snowPlane = new THREE.Mesh(this.snowGeometry, this.snowMaterial);
        this.snowPlane.receiveShadow = true;
        this.scene.add(this.snowPlane);

        // 初始化雪地数据
        this.initSnowData();
    }

    /**
     * 初始化雪地数据
     */
    initSnowData() {
        // 雪地顶点位置和法线数据
        const positions = this.snowGeometry.attributes.position;
        this.count = positions.count;
        this.basePositions = new Float32Array(this.count * 3); // 原始位置
        this.baseNormals = new Float32Array(this.count * 3);   // 原始法线
        this.elevations = new Float32Array(this.count);        // 高度数据
        this.trackIntensity = new Float32Array(this.count);    // 痕迹强度

        // 保存原始位置和法线数据
        for (let i = 0; i < this.count; i++) {
            this.basePositions[i * 3] = positions.getX(i);
            this.basePositions[i * 3 + 1] = positions.getY(i);
            this.basePositions[i * 3 + 2] = positions.getZ(i);

            this.baseNormals[i * 3] = 0;
            this.baseNormals[i * 3 + 1] = 1;
            this.baseNormals[i * 3 + 2] = 0;

            this.elevations[i] = 0;
            this.trackIntensity[i] = 0;
        }
    }

    /**
     * 创建调试用的立方体
     */
    createDebugCube() {
        // 如果提供了调试物体，则使用它
        if (this.options.debugObject) {
            this.cube = this.options.debugObject;
            return;
        }

        // 创建默认立方体（代表小车）
        const cubeGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this.cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        this.cube.position.y = 0.1; // 放在雪地上方
        this.cube.castShadow = true;
        this.scene.add(this.cube);
    }

    /**
     * 初始化控制
     */
    initControls() {
        // 控制键状态
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
    }

    /**
     * 初始化事件监听
     */
    initEventListeners() {
        // 键盘事件监听
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() in this.keys) {
                this.keys[e.key.toLowerCase()] = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() in this.keys) {
                this.keys[e.key.toLowerCase()] = false;
            }
        });

        // 窗口大小调整
        window.addEventListener('resize', () => {
            if (this.camera.isPerspectiveCamera) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
            }
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    /**
     * 获取给定位置的网格顶点索引
     * @param {number} x - x坐标
     * @param {number} z - z坐标
     * @returns {number} 顶点索引
     */
    getVertexIndex(x, z) {
        // 将世界坐标转为网格索引
        const halfSize = this.snowSize / 2;
        const xIndex = Math.floor((x + halfSize) / this.subdivision);
        const zIndex = Math.floor((z + halfSize) / this.subdivision);

        // 确保索引在有效范围内
        const clampedXIndex = Math.max(0, Math.min(this.snowSegments, xIndex));
        const clampedZIndex = Math.max(0, Math.min(this.snowSegments, zIndex));

        return clampedZIndex * (this.snowSegments + 1) + clampedXIndex;
    }

    /**
     * 压低雪地并改变颜色
     * @param {number} x - 压痕x坐标
     * @param {number} z - 压痕z坐标
     * @param {number} radius - 压痕半径
     * @param {number} depth - 压痕深度
     * @param {number} colorIntensity - 颜色强度
     */
    pressSnow(x, z, radius = 0.5, depth = 0.1, colorIntensity = 0.6) {
        for (let i = 0; i < this.count; i++) {
            const vx = this.basePositions[i * 3];
            const vz = this.basePositions[i * 3 + 2];

            const distance = Math.sqrt((vx - x) ** 2 + (vz - z) ** 2);

            if (distance < radius) {
                // 计算基于距离的影响力
                const influence = 1 - (distance / radius);

                // 更新高度 - 只降低，不升高
                const newElevation = Math.min(this.elevations[i], -depth * influence);
                if (newElevation < this.elevations[i]) {
                    this.elevations[i] = newElevation;
                }

                // 更新痕迹强度 - 只增加，不减少
                const newIntensity = Math.max(this.trackIntensity[i], colorIntensity * influence);
                if (newIntensity > this.trackIntensity[i]) {
                    this.trackIntensity[i] = newIntensity;
                }
            }
        }

        // 更新几何体
        this.updateSnowGeometry();
    }

    /**
     * 更新雪地几何体顶点、法线和颜色
     */
    updateSnowGeometry() {
        const positionAttribute = this.snowGeometry.attributes.position;
        const normalAttribute = this.snowGeometry.attributes.normal;
        const colorAttribute = this.snowGeometry.attributes.color;

        // 应用高度变形和更新颜色
        for (let i = 0; i < this.count; i++) {
            // 设置新的高度
            positionAttribute.setY(i, this.basePositions[i * 3 + 1] + this.elevations[i]);

            // 更新颜色 - 雪地痕迹为蓝灰色 (0.8, 0.85, 0.9)
            const intensity = this.trackIntensity[i];
            const r = 1 - (intensity * 0.2);       // 减少红色
            const g = 1 - (intensity * 0.15);      // 稍微减少绿色
            const b = 1 - (intensity * 0.1);       // 少量减少蓝色

            colorAttribute.setXYZ(i, r, g, b);
        }

        // 计算新的法线
        for (let i = 0; i < this.count; i++) {
            const x = Math.floor(i % (this.snowSegments + 1));
            const z = Math.floor(i / (this.snowSegments + 1));

            // 寻找邻居
            let left = i, right = i, top = i, bottom = i;

            if (x > 0) left = i - 1;
            if (x < this.snowSegments) right = i + 1;
            if (z > 0) top = i - (this.snowSegments + 1);
            if (z < this.snowSegments) bottom = i + (this.snowSegments + 1);

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

    /**
     * 添加车辆轨迹
     * @param {THREE.Vector3} position - 车辆位置
     * @param {number} wheelOffset - 车轮偏移
     */
    addVehicleTrack(position, wheelOffset = 0.2) {
        // 车轮参数
        const wheelRadius = 0.1;
        const wheelDepth = 0.08;

        // 添加四个轮子的痕迹
        this.pressSnow(
            position.x - wheelOffset,
            position.z - wheelOffset,
            wheelRadius,
            wheelDepth,
            0.8
        );
        this.pressSnow(
            position.x + wheelOffset,
            position.z - wheelOffset,
            wheelRadius,
            wheelDepth,
            0.8
        );
        this.pressSnow(
            position.x - wheelOffset,
            position.z + wheelOffset,
            wheelRadius,
            wheelDepth,
            0.8
        );
        this.pressSnow(
            position.x + wheelOffset,
            position.z + wheelOffset,
            wheelRadius,
            wheelDepth,
            0.8
        );

        // 添加车辆底部中心的痕迹
        this.pressSnow(
            position.x,
            position.z,
            0.3,
            0.05,
            0.4
        );
    }

    /**
     * 更新车辆位置
     */
    updateVehiclePosition() {
        if (!this.cube) return;

        // 记录移动前的位置
        const oldPosition = this.cube.position.clone();
        let moved = false;

        // 更新控制
        if (this.keys.w) {
            this.cube.position.z -= this.movementSpeed;
            moved = true;
        }
        if (this.keys.s) {
            this.cube.position.z += this.movementSpeed;
            moved = true;
        }
        if (this.keys.a) {
            this.cube.position.x -= this.movementSpeed;
            moved = true;
        }
        if (this.keys.d) {
            this.cube.position.x += this.movementSpeed;
            moved = true;
        }

        // 如果移动了，计算旋转
        if (moved) {
            // 计算移动向量
            const moveVector = new THREE.Vector3()
                .subVectors(this.cube.position, oldPosition)
                .normalize();

            // 只有当移动向量有长度时才旋转
            if (moveVector.length() > 0.001) {
                // 计算在xz平面上的旋转角度
                // Math.atan2 要求参数顺序为(y, x)
                this.cube.rotation.y = Math.atan2(moveVector.x, moveVector.z);
            }
        }

        // 限制在雪地范围内
        const limit = this.snowSize / 2 - 1;
        this.cube.position.x = Math.max(-limit, Math.min(limit, this.cube.position.x));
        this.cube.position.z = Math.max(-limit, Math.min(limit, this.cube.position.z));

        // 如果移动了，添加雪痕
        if (!this.cube.position.equals(this.lastPosition)) {
            this.addVehicleTrack(this.cube.position);
            this.lastPosition.copy(this.cube.position);
        }
    }

    /**
     * 动画循环
     */
    animate() {
        requestAnimationFrame(this.animate.bind(this));

        // 更新车辆位置
        this.updateVehiclePosition();

        // 更新轨道控制器
        if (this.controls) this.controls.update();

        // 渲染场景
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * 在指定位置创建雪痕
     * @param {number} x - x坐标
     * @param {number} z - z坐标
     * @param {number} radius - 压痕半径 
     * @param {number} depth - 压痕深度
     * @param {number} colorIntensity - 颜色强度
     */
    createTrack(x, z, radius = 0.5, depth = 0.1, colorIntensity = 0.6) {
        this.pressSnow(x, z, radius, depth, colorIntensity);
    }

    /**
     * 重置雪地
     */
    resetSnow() {
        // 重置所有高度和痕迹强度
        for (let i = 0; i < this.count; i++) {
            this.elevations[i] = 0;
            this.trackIntensity[i] = 0;
        }
        this.updateSnowGeometry();
    }

    /**
     * 设置雪地颜色
     * @param {THREE.Color|number|string} color - 新颜色
     */
    setSnowColor(color) {
        this.snowMaterial.color.set(color);
    }
}

export { SnowFieldSystem };