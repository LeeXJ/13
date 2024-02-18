import {Actor, ActorType} from "./types.js";
import {game} from "./gameState.js";
import {raycastSphereActor} from "./phy.js";
import {WORLD_BOUNDS_SIZE, WORLD_SCALE} from "../assets/params.js";
import {testRayWithAABB} from "../utils/collision/collision.js";
import {sqrLength3, sqrt} from "../utils/math.js";
import {TILE_MAP_STRIDE, TILE_SIZE} from "./tilemap.js";
import {TRACE_HIT, traceRay} from "../utils/collision/fastVoxelRaycast.js";

// 定义了一个名为 RaycastHit 的接口
export interface RaycastHit {
    // 射线与碰撞物体的交点距离
    _t: number;
    // 碰撞物体的类型
    _type: number;
    // 可选属性，表示与射线相交的物体（Actor 对象）
    _actor?: Actor;
}

// 定义了一个名为 RaycastHits 的接口
export interface RaycastHits {
    // 表示是否有射线与物体相交
    _hasHits: number;
    // 表示所有相交的 RaycastHit 对象的数组
    _hits: RaycastHit[];
    // 表示射线的起点坐标 x
    _x: number;
    // 表示射线的起点坐标 y
    _y: number;
    // 表示射线的起点坐标 z
    _z: number;
    // 表示射线的方向向量 x 分量
    _dx: number;
    // 表示射线的方向向量 y 分量
    _dy: number;
    // 表示射线的方向向量 z 分量
    _dz: number;
}

// 定义了一个名为 RAYCAST_HITS 的常量对象
export const RAYCAST_HITS = {
    // 表示是否有射线与物体相交，初始值为 0，表示没有相交
    _hasHits: 0,
    // 表示所有相交的 RaycastHit 对象的数组，初始为空数组
    _hits: [],
    // 表示射线的起点坐标 x 分量，初始值为 0
    _x: 0,
    // 表示射线的起点坐标 y 分量，初始值为 0
    _y: 0,
    // 表示射线的起点坐标 z 分量，初始值为 0
    _z: 0,
    // 表示射线的方向向量 x 分量，初始值为 0
    _dx: 0,
    // 表示射线的方向向量 y 分量，初始值为 0
    _dy: 0,
    // 表示射线的方向向量 z 分量，初始值为 0
    _dz: 0,
};

// 定义了一个名为 raycastWorld 的函数，用于对世界进行射线投射
export const raycastWorld = (
    x: number, // 射线的起点 x 坐标
    y: number, // 射线的起点 y 坐标
    z: number, // 射线的起点 z 坐标
    dx: number, // 射线的方向向量 x 分量
    dy: number, // 射线的方向向量 y 分量
    dz: number, // 射线的方向向量 z 分量
    hits: RaycastHits, // 射线投射的结果保存在这个对象中
    bulletOwnerId = 0, // 子弹的所有者ID，默认为 0
) => {
    // 计算射线的方向向量的长度
    const dirN = sqrt(sqrLength3(dx, dy, dz));
    // 清空射线投射结果中的 hits 数组
    hits._hits.length = 0;
    // 将射线的起点坐标和方向向量保存到 hits 对象中
    hits._x = x;
    hits._y = y;
    hits._z = z;
    hits._dx = dx /= dirN;
    hits._dy = dy /= dirN;
    hits._dz = dz /= dirN;
    // 将射线是否与物体相交的标志设置为 0
    hits._hasHits = 0;
    // 初始化相交的标志位
    let has = 0;
    // 检测射线是否与世界边界相交，并计算相交距离
    const boundsDist = testRayWithAABB(
        x,
        y,
        z,
        dx,
        dy,
        dz,
        0,
        0,
        WORLD_BOUNDS_SIZE,
        WORLD_BOUNDS_SIZE,
        0,
        WORLD_BOUNDS_SIZE,
    );
    // 如果相交距离大于等于 0，表示射线与世界边界相交
    if (boundsDist >= 0) {
        // 设置相交的标志位，并将相交距离添加到 hits 对象中
        has |= 1;
        hits._hits.push({
            _type: 1,
            _t: boundsDist,
        });
    }
    // 遍历游戏状态中的玩家角色
    for (const a of game._state._actors[ActorType.Player]) {
        // 如果不是子弹的所有者
        if (a._client - bulletOwnerId) {
            // 检测射线是否与玩家角色相交，并计算相交距离
            const d = raycastSphereActor(x, y, z, dx, dy, dz, a);
            // 如果相交距离大于等于 0，表示射线与玩家角色相交
            if (d >= 0) {
                // 设置相交的标志位，并将相交距离和相交的角色添加到 hits 对象中
                has |= 2;
                hits._hits.push({
                    _type: 2,
                    _t: d,
                    _actor: a,
                });
            }
        }
    }
    // 遍历游戏状态中的桶
    for (const a of game._state._actors[ActorType.Barrel]) {
        // 检测射线是否与桶相交，并计算相交距离
        const d = raycastSphereActor(x, y, z, dx, dy, dz, a);
        // 如果相交距离大于等于 0，表示射线与桶相交
        if (d >= 0) {
            // 设置相交的标志位，并将相交距离和相交的桶添加到 hits 对象中
            has |= 2;
            hits._hits.push({
                _type: 2,
                _t: d,
                _actor: a,
            });
        }
    }
    // 遍历游戏中的树
    for (const a of game._trees) {
        // 检测射线是否与树相交，并计算相交距离
        const d = raycastSphereActor(x, y, z, dx, dy, dz, a);
        // 如果相交距离大于等于 0，表示射线与树相交
        if (d >= 0) {
            // 设置相交的标志位，并将相交距离和相交的树添加到 hits 对象中
            has |= 2;
            hits._hits.push({
                _type: 2,
                _t: d,
                _actor: a,
            });
        }
    }
    // 计算射线的最大距离
    const maxDistance = boundsDist >= 0 ? boundsDist : WORLD_BOUNDS_SIZE * 2.5;
    // 进行射线追踪，检测射线是否与地图块相交，并计算相交距离
    const d = traceRay(
        game._blocks,
        TILE_MAP_STRIDE,
        x / (TILE_SIZE * WORLD_SCALE),
        y / (TILE_SIZE * WORLD_SCALE),
        dx,
        dy,
        maxDistance / (TILE_SIZE * WORLD_SCALE),
        TRACE_HIT,
    );
    // 如果相交距离大于等于 0，表示射线与地图块相交
    if (d >= 0) {
        // 设置相交的标志位，并将相交距离添加到 hits 对象中
        has |= 4;
        hits._hits.push({
            _type: 4,
            _t: d * TILE_SIZE * WORLD_SCALE,
        });
    }
    // 设置射线是否有相交的标志位
    hits._hasHits = has;
    // 如果 hits 中的 hits 数组长度大于 1，则对 hits 数组进行按相交距离排序
    if (hits._hits.length > 1) {
        hits._hits.sort((a, b) => a._t - b._t);
    }
};
