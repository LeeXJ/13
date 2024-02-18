// 导入来自其他文件的常量和类型
import {WORLD_BOUNDS_SIZE, WORLD_SCALE} from "../assets/params.js";
import {Actor} from "./types.js";
import {max} from "../utils/math.js";

// 定义常量 GRID_R，并初始化为 16 乘以 WORLD_SCALE 的值
export const GRID_R = 16 * WORLD_SCALE;

// 定义常量 GRID_D，初始化为 GRID_R 的两倍
export const GRID_D = GRID_R * 2;

// 定义常量 GRID_STRIDE，初始化为 WORLD_BOUNDS_SIZE 除以 GRID_D 的结果
export const GRID_STRIDE = WORLD_BOUNDS_SIZE / GRID_D;

// 定义常量 GRID_D_BITS，初始化为 11（注释掉的部分原本是取 GRID_D 的对数，但是直接给定了值）
export const GRID_D_BITS = 11; //Math.log2(GRID_D);

// 定义常量 GRID_STRIDE_BITS，初始化为 5（同上，注释掉的部分是对 GRID_STRIDE 取对数）
export const GRID_STRIDE_BITS = 5; //Math.log2(GRID_STRIDE);

// 注释掉的代码定义了一个函数 gridAddr(x, y)，根据传入的 x 和 y 坐标计算网格地址，但是被注释掉了，可能是暂时不需要或者有其他原因
// export const gridAddr = (x: number, y: number) =>
//     (x >> GRID_D_BITS) + ((y >> GRID_D_BITS) << GRID_STRIDE_BITS);

// 定义了一个名为 NEIGHBOURS 的常量数组，包含了四个整数值
const NEIGHBOURS = [0, 1, GRID_STRIDE, GRID_STRIDE + 1];

export const addToGrid = (grid: Actor[][], a: Actor) => {
    // 计算角色所在的网格索引，并将角色添加到相应的网格中
    (grid[(a._x >> GRID_D_BITS) + ((a._y >> GRID_D_BITS) << GRID_STRIDE_BITS)] ??= []).push(a);
};

export const queryGridCollisions = (
    actor: Actor, // 待查询碰撞的角色对象
    grid: Actor[][], // 网格空间的二维数组，存储了每个网格中的角色信息
    callback: (a: Actor, b: Actor) => void, // 处理碰撞的回调函数
    disableMask = 1, // 可选参数，表示禁用掩码，默认值为1
) => {
    // 计算待查询角色所在网格的行列索引
    const cx = max(0, actor._x - GRID_R) >> GRID_D_BITS;
    const cy = max(0, actor._y - GRID_R) >> GRID_D_BITS;
    const h = cx + (cy << GRID_STRIDE_BITS);
    
    // 遍历待查询角色周围的相邻网格
    for (let i = 0; i < 4; ++i) {
        const cell = grid[h + NEIGHBOURS[i]]; // 获取相邻网格中的角色数组
        if (cell) {
            // 遍历相邻网格中的角色数组
            for (const b of cell) {
                // 如果角色的禁用掩码与当前角色的本地状态标志进行逻辑与操作后的结果不为0，说明需要检查碰撞
                if ((b._localStateFlags | disableMask) & 1) {
                    // 调用回调函数处理碰撞
                    callback(actor, b);
                }
            }
        }
    }
};
