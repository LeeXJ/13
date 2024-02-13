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
    to._x = from._x;
    to._y = from._y;
    to._z = from._z + GAME_CFG.actors[from._type].height;
};

export const updateBody = (body: Pos & Vel, gravity: number, loss: number) => {
    addPos(body, body._u, body._v, body._w);
    if (body._z > 0) {
        body._w -= gravity;
    } else {
        body._z = 0;
        if (body._w < 0) {
            body._w = -body._w / loss;
            return true;
        }
    }
    return false;
};

export const updateAnim = (actor: Actor) => {
    actor._animHit = reach(actor._animHit, 0, 2);
};

export const updateActorPhysics = (a: Actor, tileMap: number[]) => {
    const prop = GAME_CFG.actors[a._type];
    const isWeakGravity = a._type === ActorType.Player ? (a as PlayerActor)._input & ControlsFlag.Jump : 0;
    const worldConfig = GAME_CFG.world;
    const gravity = isWeakGravity ? worldConfig.gravityWeak : worldConfig.gravity;
    updateBody(a, gravity, prop.groundLoss);
    // TODO: ?
    checkTileCollisions(a, tileMap);
    collideWithBoundsA(a);
    if (a._z <= 0) {
        applyGroundFriction(a, prop.groundFriction);
    }
    updateAnim(a);
};

export const collideWithBoundsA = (body: Actor): number => {
    const props = GAME_CFG.actors[body._type];
    return collideWithBounds(body, props.radius, props.boundsLoss);
};

export const collideWithBounds = (body: Vel & Pos, radius: number, loss: number): number => {
    let has = 0;
    if (body._y > WORLD_BOUNDS_SIZE - radius) {
        body._y = WORLD_BOUNDS_SIZE - radius;
        has |= 2;
        reflectVelocity(body, 0, 1, loss);
    } else if (body._y < radius) {
        body._y = radius;
        has |= 2;
        reflectVelocity(body, 0, 1, loss);
    }
    if (body._x > WORLD_BOUNDS_SIZE - radius) {
        body._x = WORLD_BOUNDS_SIZE - radius;
        has |= 4;
        reflectVelocity(body, 1, 0, loss);
    } else if (body._x < radius) {
        body._x = radius;
        has |= 4;
        reflectVelocity(body, 1, 0, loss);
    }
    return has;
};

export const addRadialVelocity = (vel: Vel, a: number, velXYLen: number, velZ: number) => {
    addVelocityDir(vel, velXYLen * cos(a), (velXYLen * sin(a)) / 2, velZ);
};

export const reflectVelocity = (v: Vel, nx: number, ny: number, loss: number) => {
    // r = d - 2(d⋅n)n
    const Z = 2 * (v._u * nx + v._v * ny);
    v._u = (v._u - Z * nx) / loss;
    v._v = (v._v - Z * ny) / loss;
};

export const limitVelocity = (v: Vel, len: number) => {
    let l = v._u * v._u + v._v * v._v;
    if (l > len * len) {
        l = len / sqrt(l);
        v._u *= l;
        v._v *= l;
    }
};

export const applyGroundFriction = (p: Actor, amount: number) => {
    let v0 = p._u * p._u + p._v * p._v;
    if (v0 > 0) {
        v0 = sqrt(v0);
        v0 = reach(v0, 0, amount) / v0;
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
    const ca = GAME_CFG.actors[a._type];
    const cb = GAME_CFG.actors[b._type];
    const D = ca.radius + cb.radius;
    return sqrLength3(a._x - b._x, a._y - b._y, a._z + ca.height - b._z - cb.height) < D * D;
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
