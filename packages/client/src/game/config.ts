import { GameConfig } from "../data/config.js";

// 定义常量对象
export const Const = {
    NetFq: 60,           // 网络频率
    InputDelay: 8,       // 输入延迟
    PredictionMax: 8,   // 最大预测
    Prediction: 1,      // 预测
} as const;
// 定义类型别名，使得 Const 只能被 Const 中的属性值来赋值
export type Const = (typeof Const)[keyof typeof Const];

// 调试用的全局变量，初始值为 0
export let _debugLagK = 0;

// 设置调试用的全局变量 _debugLagK 的值
export const setDebugLagK = (a: number) => (_debugLagK = a);

// 游戏配置对象，初始值为 undefined
export let GAME_CFG: GameConfig;
// 设置游戏配置对象的值
export const setGameConfig = (gameConfig: GameConfig) => (GAME_CFG = gameConfig);
