import { WORLD_BOUNDS_SIZE_PX } from "../assets/params.js";

// 定义瓦片的大小（以像素为单位）
export const TILE_SIZE = 16;
// 定义瓦片大小的位数（用于位运算）
export const TILE_SIZE_BITS = 4;
// 计算瓦片地图的行宽（以瓦片为单位），使用右移运算符将 WORLD_BOUNDS_SIZE_PX 转换为瓦片单位
export const TILE_MAP_STRIDE = WORLD_BOUNDS_SIZE_PX >>> TILE_SIZE_BITS;
// 根据需要，您可以计算 TILE_MAP_STRIDE_BITS，但是在提供的代码中此行代码被注释掉了
// export const TILE_MAP_STRIDE_BITS = (WORLD_BOUNDS_SIZE / WORLD_SCALE) >>> TILE_SIZE_BITS;