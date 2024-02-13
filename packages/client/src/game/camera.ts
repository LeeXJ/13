import {dec1, hypot, max, min} from "@iioi/client/utils/math.js";
import {gl} from "@iioi/client/graphics/draw2d.js";
import {GAME_CFG} from "@iioi/client/game/config.js";
import {WORLD_SCALE} from "@iioi/client/assets/params.js";
import {WeaponConfig} from "../data/config.js";

// 计算屏幕缩放比例
export const getScreenScale = () => min(gl.drawingBufferWidth, gl.drawingBufferHeight) / GAME_CFG.camera.size;

// 游戏摄像机的属性接口
export interface GameCamera {
    _x: number;         // 摄像机位置的 x 坐标
    _y: number;         // 摄像机位置的 y 坐标
    _scale: number;     // 摄像机的缩放比例
    _shake: number;     // 摄像机的震动强度
    _feedback: number;  // 摄像机的反馈强度
    _feedbackX: number; // 摄像机的反馈 x 坐标
    _feedbackY: number; // 摄像机的反馈 y 坐标
}

// 创建一个新的游戏摄像机对象，初始化摄像机属性
const newGameCamera = () => ({
    _x: 0,             // 初始位置为原点
    _y: 0,
    _scale: 1,         // 初始缩放比例为 1
    _shake: 0,         // 初始震动强度为 0
    _feedback: 0,      // 初始反馈强度为 0
    _feedbackX: 0,     // 初始反馈坐标为原点
    _feedbackY: 0,
});

// 复制一个摄像机的属性到另一个摄像机对象中
const copyGameCamera = (dest: GameCamera, src: GameCamera) => {
    dest._x = src._x;             // 复制位置
    dest._y = src._y;
    dest._scale = src._scale;     // 复制缩放比例
    dest._shake = src._shake;     // 复制震动强度
    dest._feedback = src._feedback; // 复制反馈强度
    dest._feedbackX = src._feedbackX; // 复制反馈坐标
    dest._feedbackY = src._feedbackY;
};

// 当前的游戏摄像机对象
export const gameCamera = newGameCamera();

// 临时的摄像机对象，用于保存游戏摄像机状态
const camera0 = newGameCamera();

// 保存当前游戏摄像机状态
export const saveGameCamera = () => copyGameCamera(camera0, gameCamera);

// 恢复之前保存的游戏摄像机状态
export const restoreGameCamera = () => copyGameCamera(gameCamera, camera0);

// 减少摄像机效果
export const decCameraEffects = () => {
    gameCamera._shake = dec1(gameCamera._shake);    // 减少震动强度
    gameCamera._feedback = dec1(gameCamera._feedback); // 减少反馈强度
};

// 定义一个函数用于根据武器射击的效果给摄像机反馈震动和反馈
export const feedbackCameraShot = (weapon: WeaponConfig, dx: number, dy: number) => {
    // 将武器的摄像机震动强度与当前摄像机的震动强度进行比较，并取较大值更新摄像机的震动强度
    gameCamera._shake = max(gameCamera._shake, weapon.cameraShake);
    // 根据武器的反馈系数计算摄像机的反馈值，并更新摄像机的反馈坐标和反馈强度
    const feedback = 20 * weapon.cameraFeedback;
    gameCamera._feedbackX = feedback * dx;
    gameCamera._feedbackY = feedback * dy;
    // 增加摄像机的反馈计数器，用于控制反馈效果的持续时间
    gameCamera._feedback += 3;
};

// 定义一个函数用于根据爆炸效果给摄像机反馈震动
export const feedbackCameraExplosion = (shake: number, x: number, y: number) => {
    // 根据爆炸的位置和摄像机的位置计算震动的强度
    // 使用 hypot 函数计算两点之间的距离
    // 使用游戏摄像机的坐标减去爆炸位置的坐标，然后除以 WORLD_SCALE（世界缩放比例）来得到实际的距离
    const distance = hypot(gameCamera._x - x / WORLD_SCALE, gameCamera._y - y / WORLD_SCALE);
    // 根据距离调整震动的强度
    shake *= 1 - distance / 256;
    // 更新摄像机的震动强度
    // 使用 max 函数确保摄像机的震动强度不会低于当前的震动强度
    gameCamera._shake = max(gameCamera._shake, shake | 0);
};
