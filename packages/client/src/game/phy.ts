import {Actor, ActorType, ControlsFlag, PlayerActor, Pos, Vel} from "./types.js";
import {rand} from "../utils/rnd.js";
import {clamp, cos, hypot, max, min, reach, sin, sqrLength3, sqrt} from "../utils/math.js";
import {WORLD_BOUNDS_SIZE, WORLD_SCALE, OBJECT_RADIUS} from "../assets/params.js";
import {GAME_CFG} from "./config.js";
import {TILE_MAP_STRIDE, TILE_SIZE, TILE_SIZE_BITS} from "./tilemap.js";
import {testRayWithSphere} from "../utils/collision/collision.js";

export const setRandomPosition = (actor: Actor) => {
    actor._x = OBJECT_RADIUS + rand(WORLD_BOUNDS_SIZE - OBJECT_RADIUS * 2);
    actor._y = OBJECT_RADIUS + rand(WORLD_BOUNDS_SIZE - OBJECT_RADIUS * 2);
};

export const copyPosFromActorCenter = (to: Pos, from: Pos & {_type: ActorType}) => {
    // 将目标位置的坐标设为源位置的坐标
    to._x = from._x;
    to._y = from._y;
    // 将目标位置的 z 坐标设为源位置的 z 坐标加上源角色的高度
    to._z = from._z + GAME_CFG.actors[from._type].height;
};

export const updateBody = (body: Pos & Vel, gravity: number, loss: number) => {
    // 根据物体当前的速度，更新物体的位置
    addPos(body, body._u, body._v, body._w);
    // 如果物体在空中，则考虑重力对其速度的影响
    if (body._z > 0) {
        body._w -= gravity; // 根据重力减小物体的垂直速度分量
    } else {
        // 如果物体在地面上或者以下，则停止下落并考虑能量损失
        body._z = 0; // 将物体的高度修正为0（地面）
        if (body._w < 0) { // 如果物体的垂直速度分量小于0（向下运动）
            body._w = -body._w / loss; // 根据能量损失因子减小物体的垂直速度分量（模拟能量损失）
            return true; // 返回true表示物体停止了下落
        }
    }
    return false; // 返回false表示物体仍然在空中或者在地面上运动
};

export const updateAnim = (actor: Actor) => {
    actor._animHit = reach(actor._animHit, 0, 2);
};

export const updateActorPhysics = (a: Actor, tileMap: number[]) => {
    // 获取角色的属性配置
    const prop = GAME_CFG.actors[a._type];
    // 判断角色是否处于弱重力状态（例如玩家在跳跃状态下），以决定使用哪种重力
    const isWeakGravity = a._type === ActorType.Player ? (a as PlayerActor)._input & ControlsFlag.Jump : 0;
    // 获取世界配置中的重力值
    const worldConfig = GAME_CFG.world;
    // 根据角色是否处于弱重力状态，选择相应的重力值
    const gravity = isWeakGravity ? worldConfig.gravityWeak : worldConfig.gravity;
    // 更新角色的物理状态（位置、速度等）
    updateBody(a, gravity, prop.groundLoss);
    // TODO: ?  // 待实现的功能或者待解决的问题，这里应该添加一个注释说明
    // 检查角色与瓦片的碰撞，但具体实现在另一个函数中，此处未提供
    checkTileCollisions(a, tileMap);
    // 处理角色与边界的碰撞
    collideWithBoundsA(a);
    // 如果角色在地面上，则应用地面摩擦力
    if (a._z <= 0) {
        applyGroundFriction(a, prop.groundFriction);
    }
    // 更新角色的动画状态
    updateAnim(a);
};

export const collideWithBoundsA = (body: Actor): number => {
    const props = GAME_CFG.actors[body._type];
    return collideWithBounds(body, props.radius, props.boundsLoss);
};

export const collideWithBounds = (body: Vel & Pos, radius: number, loss: number): number => {
    let has = 0; // 初始化标志位

    // 检查上下边界的碰撞
    if (body._y > WORLD_BOUNDS_SIZE - radius) { // 如果物体下边界超出了世界边界
        body._y = WORLD_BOUNDS_SIZE - radius; // 将物体位置修正到世界边界上
        has |= 2; // 更新标志位，表示发生了上下边界的碰撞
        reflectVelocity(body, 0, 1, loss); // 根据法线(0,1)反射速度向量
    } else if (body._y < radius) { // 如果物体上边界超出了世界边界
        body._y = radius; // 将物体位置修正到世界边界上
        has |= 2; // 更新标志位，表示发生了上下边界的碰撞
        reflectVelocity(body, 0, 1, loss); // 根据法线(0,1)反射速度向量
    }

    // 检查左右边界的碰撞
    if (body._x > WORLD_BOUNDS_SIZE - radius) { // 如果物体右边界超出了世界边界
        body._x = WORLD_BOUNDS_SIZE - radius; // 将物体位置修正到世界边界上
        has |= 4; // 更新标志位，表示发生了左右边界的碰撞
        reflectVelocity(body, 1, 0, loss); // 根据法线(1,0)反射速度向量
    } else if (body._x < radius) { // 如果物体左边界超出了世界边界
        body._x = radius; // 将物体位置修正到世界边界上
        has |= 4; // 更新标志位，表示发生了左右边界的碰撞
        reflectVelocity(body, 1, 0, loss); // 根据法线(1,0)反射速度向量
    }

    return has; // 返回标志位，表示碰撞情况
};

export const addRadialVelocity = (vel: Vel, a: number, velXYLen: number, velZ: number) => {
    // 计算水平方向上的速度分量，根据极角和长度使用三角函数计算
    const velX = velXYLen * Math.cos(a);
    // 计算垂直方向上的速度分量，根据极角和长度使用三角函数计算
    const velY = (velXYLen * Math.sin(a)) / 2;
    // 调用另一个函数来更新速度向量，将水平和垂直方向上的速度分量和垂直方向上的速度分量传递给该函数
    addVelocityDir(vel, velX, velY, velZ);
};

export const reflectVelocity = (v: Vel, nx: number, ny: number, loss: number) => {
    // 计算入射向量与法线向量的点积的两倍
    const Z = 2 * (v._u * nx + v._v * ny);
    // 使用反射公式更新速度向量的 x 分量
    v._u = (v._u - Z * nx) / loss;
    // 使用反射公式更新速度向量的 y 分量
    v._v = (v._v - Z * ny) / loss;
};

export const limitVelocity = (v: Vel, len: number) => {
    // 计算速度向量的长度的平方
    let l = v._u * v._u + v._v * v._v;

    // 如果速度向量的长度的平方大于指定长度的平方
    if (l > len * len) {
        // 计算速度向量的归一化因子
        l = len / sqrt(l);

        // 将速度向量乘以归一化因子，以限制速度的大小
        v._u *= l;
        v._v *= l;
    }
};

export const applyGroundFriction = (p: Actor, amount: number) => {
    // 计算角色当前速度的平方
    let v0 = p._u * p._u + p._v * p._v;
    
    // 如果速度的平方大于0，表示角色有运动
    if (v0 > 0) {
        // 计算速度的大小
        v0 = sqrt(v0);
        
        // 根据摩擦力量来调整速度
        v0 = reach(v0, 0, amount) / v0;
        
        // 将调整后的速度应用到角色的 u 和 v 分量上
        p._u *= v0;
        p._v *= v0;
    }
};

export const addVelFrom = (to: Vel, from: Vel, scale = 1) => addVelocityDir(to, from._u, from._v, from._w, scale);

export const addVelocityDir = (v: Vel, x: number, y: number, z: number, scale = 1) => {
    v._u += scale * x;
    v._v += scale * y;
    v._w += scale * z;
};

export const addPos = (to: Pos, x: number, y: number, z: number, scale = 1) => {
    to._x += scale * x;
    to._y += scale * y;
    to._z += scale * z;
};

export const sqrDistXY = (a: Actor, b: Actor) => {
    const dx = a._x - b._x;
    const dy = a._y - b._y;
    return dx * dx + dy * dy;
};

export const testIntersection = (a: Actor, b: Actor): boolean => {
    // 获取角色 a 和角色 b 的配置信息
    const ca = GAME_CFG.actors[a._type];
    const cb = GAME_CFG.actors[b._type];

    // 计算两个角色的半径之和
    const D = ca.radius + cb.radius;

    // 计算两个角色之间的距离的平方
    const sqrDist = sqrLength3(a._x - b._x, a._y - b._y, a._z + ca.height - b._z - cb.height);

    // 如果两个角色之间的距离的平方小于半径之和的平方，则表示两个角色相交
    return sqrDist < D * D;
};

export const checkBodyCollision = (a: Actor, b: Actor) => {
    // 获取每个角色的属性
    const ca = GAME_CFG.actors[a._type]; // 角色a的配置
    const cb = GAME_CFG.actors[b._type]; // 角色b的配置

    // 计算两个角色之间的相对位移
    const nx = a._x - b._x; // x方向位移
    const ny = (a._y - b._y) * 2; // y方向位移
    const nz = a._z + ca.height - (b._z + cb.height); // z方向位移，考虑角色的高度

    // 计算平方距离
    const sqrDist = sqrLength3(nx, ny, nz);

    // 计算碰撞阈值（两个角色半径之和）
    const D = ca.radius + cb.radius;

    // 如果两个角色之间有距离并且距离小于阈值，表示发生碰撞
    if (sqrDist > 0 && sqrDist < D * D) {
        // 计算碰撞的深度
        const pen = (D / sqrt(sqrDist) - 1) / 2;

        // 根据质量分配碰撞深度，更新位置
        addPos(a, nx, ny, nz, ca.invMass * pen);
        addPos(b, nx, ny, nz, -cb.invMass * pen);
    }
};

export const raycastSphereActor = (
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    actor: Actor,
): number => {
    // 从游戏配置中获取指定类型的角色属性
    const props = GAME_CFG.actors[actor._type];
    // 使用射线和球体之间的碰撞检测函数，返回碰撞点的距离
    return testRayWithSphere(x, y, z, dx, dy, dz, actor._x, actor._y, actor._z + props.height, props.radius);
};

export const roundActors = (list: Actor[]) => {
    // 对于输入的角色数组中的每一个角色
    for (const a of list) {
        // 将角色的 x 坐标舍入到 16 位精度
        a._x = a._x & 0xffff;
        // 将角色的 y 坐标舍入到 16 位精度
        a._y = a._y & 0xffff;
        // 将角色的 z 坐标舍入到 16 位精度，并确保其在指定范围内
        a._z = clamp(a._z | 0, 0, (1 << 16) - 1) & 0xffff;
        // 将角色的 u 坐标舍入到整数，并确保其在指定范围内
        a._u = clamp(a._u | 0, -1024, 1024);
        // 将角色的 v 坐标舍入到整数，并确保其在指定范围内
        a._v = clamp(a._v | 0, -1024, 1024);
        // 将角色的 w 坐标舍入到整数，并确保其在指定范围内
        a._w = clamp(a._w | 0, -1024, 1024);
    }
};

const testRectCircle = (cx: number, cy: number, l: number, t: number, r: number, b: number, out: [number, number]) => {
    // 临时变量用于设置测试边界
    let testX = cx; // 初始化 testX 为圆心的 x 坐标
    let testY = cy; // 初始化 testY 为圆心的 y 坐标

    // 哪条边是最近的？
    if (cx < l) testX = l; // 如果圆心的 x 坐标小于矩形左边界，则最近的 x 坐标为矩形左边界
    else if (cx > r) testX = r; // 如果圆心的 x 坐标大于矩形右边界，则最近的 x 坐标为矩形右边界
    if (cy < t) testY = t; // 如果圆心的 y 坐标小于矩形上边界，则最近的 y 坐标为矩形上边界
    else if (cy > b) testY = b; // 如果圆心的 y 坐标大于矩形下边界，则最近的 y 坐标为矩形下边界

    // 计算到最近边界的距离
    const distX = cx - testX; // 圆心到最近边界的 x 方向距离
    const distY = cy - testY; // 圆心到最近边界的 y 方向距离
    const distance = sqrt(distX * distX + distY * distY); // 圆心到最近边界的距离（勾股定理）

    out[0] = testX; // 将最近边界的 x 坐标存储到输出数组的第一个元素
    out[1] = testY; // 将最近边界的 y 坐标存储到输出数组的第二个元素
    // 如果距离小于半径，发生碰撞！
    return distance; // 返回圆心到最近边界的距离
};

export const checkTileCollisions = (actor: Actor, tilemap: number[]): number => {
    // 获取角色的配置信息
    const conf = GAME_CFG.actors[actor._type];

    // 计算角色所在的矩形范围
    const x0 = max(0, ((actor._x - conf.radius) / WORLD_SCALE) >> TILE_SIZE_BITS);
    const y0 = max(0, ((actor._y - conf.radius) / WORLD_SCALE) >> TILE_SIZE_BITS);
    const x1 = min(TILE_MAP_STRIDE - 1, ((actor._x + conf.radius) / WORLD_SCALE) >> TILE_SIZE_BITS);
    const y1 = min(TILE_MAP_STRIDE - 1, ((actor._y + conf.radius) / WORLD_SCALE) >> TILE_SIZE_BITS);

    // 初始化最小距离为一个很大的值
    let mindist = 100000.0;
    // 初始化碰撞点坐标和法向量
    const point: [number, number] = [0, 0];
    let nx = 0;
    let ny = 0;

    // 遍历矩形范围内的每个瓦片
    for (let cy = y0; cy <= y1; ++cy) {
        for (let cx = x0; cx <= x1; ++cx) {
            // 获取瓦片索引
            const cell = tilemap[cy * TILE_MAP_STRIDE + cx];
            if (cell) {
                // 如果瓦片不为空，则进行碰撞检测
                const dist = testRectCircle(
                    actor._x,
                    actor._y,
                    cx * WORLD_SCALE * TILE_SIZE,
                    cy * WORLD_SCALE * TILE_SIZE,
                    (cx + 1) * WORLD_SCALE * TILE_SIZE,
                    (cy + 1) * WORLD_SCALE * TILE_SIZE,
                    point,
                );
                // 如果距离小于角色半径且小于最小距离，则更新最小距离和碰撞点坐标
                if (dist < conf.radius && dist < mindist) {
                    mindist = dist;
                    nx = point[0] - actor._x;
                    ny = point[1] - actor._y;
                }
            }
        }
    }

    // 如果最小距离小于角色半径，则进行碰撞处理
    if (mindist < conf.radius) {
        // 计算碰撞点到角色中心的法向量，并归一化
        const normalLen = hypot(nx, ny);
        nx /= normalLen;
        ny /= normalLen;
        // 将角色位置调整到离碰撞点的距离为 (半径 - 最小距离) 处
        addPos(actor, nx, ny, 0, -(conf.radius - mindist));
        // 根据碰撞的法向量反射角色的速度，并考虑边界损失
        reflectVelocity(actor, 0, 1, conf.boundsLoss);
        return 1; // 返回碰撞标志
    }

    return 0; // 返回无碰撞标志
};
