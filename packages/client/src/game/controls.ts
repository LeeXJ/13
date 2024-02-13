import {inputPointers, keyboardState, KeyCode, mousePointer, Pointer} from "../utils/input.js";
import {fillCircle, strokeCircle, gl} from "../graphics/draw2d.js";
import {PlayerActor} from "./types.js";
import {
    PAD_FIRE_RADIUS_0,
    PAD_FIRE_RADIUS_1,
    PAD_MOVE_RADIUS_0,
    PAD_MOVE_RADIUS_1,
    WORLD_SCALE,
} from "../assets/params.js";
import {gameCamera, getScreenScale} from "./camera.js";
import {hypot} from "../utils/math.js";
import {drawTextAligned, fnt} from "../graphics/font.js";
import {GAME_CFG} from "./config.js";

// TODO: positioning of controls
// ToDO: control zone padding should include max radius
// TODO: return mouse control
// TODO: combine pad + keyboard
export let lookAtX = 0;
export let lookAtY = 0;
export let viewX = 0;
export let viewY = 0;
export let moveX = 0;
export let moveY = 0;
export let shootButtonDown = false;
export let jumpButtonDown = false;
export let moveFast = false;
export let dropButton = false;
export let reloadButton = false;
export let swapButton = false;

export const resetPlayerControls = () => {
    moveX = 0;
    moveY = 0;
    shootButtonDown = false;
    jumpButtonDown = false;
    moveFast = false;
    dropButton = false;
    reloadButton = false;
    swapButton = false;
};

export const couldBeReloadedManually = (player: PlayerActor): boolean => {
    const weapons = GAME_CFG.weapons;
    const weapon = weapons[player._weapon];
    return weapon && !player._clipReload && weapon.clipSize && player._clipAmmo < weapon.clipSize;
};

export const couldSwapWeaponSlot = (player: PlayerActor): boolean => {
    return !!player._weapon2;
};

export const updateControls = (player: PlayerActor) => {
    // 获取绘图缓冲区的宽度和高度
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;

    // 获取鼠标指针对象
    const mouse = mousePointer;

    // 计算玩家的位置
    const px = player._x / WORLD_SCALE;
    const py = (player._y - player._z) / WORLD_SCALE - 10;

    // 如果鼠标在绘图缓冲区内，则更新视角
    if (mouse._x >= 0 && mouse._x < W && mouse._y >= 0 && mouse._y < H) {
        lookAtX = (mouse._x - W / 2) * gameCamera._scale + gameCamera._x;
        lookAtY = (mouse._y - H / 2) * gameCamera._scale + gameCamera._y;
        viewX = lookAtX - px;
        viewY = lookAtY - py;
    } else {
        // 否则将视角归零
        viewX = 0;
        viewY = 0;
    }

    // 更新射击按钮状态
    shootButtonDown = (viewX || viewY) && mouse._active;

    // 根据键盘输入更新移动状态
    moveX =
        (keyboardState[KeyCode.D] | keyboardState[KeyCode.Right]) -
        (keyboardState[KeyCode.A] | keyboardState[KeyCode.Left]);
    moveY =
        (keyboardState[KeyCode.S] | keyboardState[KeyCode.Down]) -
        (keyboardState[KeyCode.W] | keyboardState[KeyCode.Up]);

    // 根据是否按下Shift键更新移动速度状态
    moveFast = !keyboardState[KeyCode.Shift];

    // 更新跳跃、丢弃、装填、切换武器按钮状态
    jumpButtonDown = !!keyboardState[KeyCode.Space];
    dropButton = !!keyboardState[KeyCode.E];
    reloadButton = !!keyboardState[KeyCode.R];
    swapButton = !!keyboardState[KeyCode.Q];

    // 根据玩家状态更新虚拟摇杆按钮的显示状态
    vpad[3]._hidden = !couldBeReloadedManually(player);
    vpad[4]._hidden = !couldSwapWeaponSlot(player);

    // 如果更新了虚拟摇杆，则根据摇杆状态更新移动和视角
    if (updateVirtualPad()) {
        const k = gameCamera._scale;
        let control = vpad[0];
        let pp = control._pointer;
        moveX = pp ? (pp._x - pp._startX) * k : 0;
        moveY = pp ? (pp._y - pp._startY) * k : 0;
        let len = hypot(moveX, moveY);
        moveFast = len > control._r1;
        jumpButtonDown = len > control._r2;

        control = vpad[1];
        pp = control._pointer;
        viewX = pp ? (pp._x - pp._startX) * k : 0;
        viewY = pp ? (pp._y - pp._startY) * k : 0;
        len = hypot(viewX, viewY);
        lookAtX = px + viewX * 2;
        lookAtY = py + viewY * 2;
        shootButtonDown = len > control._r2;

        dropButton = !!vpad[2]._pointer;
        reloadButton = !!vpad[3]._pointer;
        swapButton = !!vpad[4]._pointer;
    }
};

interface VPadControl {
    _l: number;
    _t: number;
    _r: number;
    _b: number;
    _isButton?: number;
    _pointer?: Pointer | undefined;
    _hidden?: boolean;
    // any len > undefined = false (undefined is NaN)
    _r1?: number | undefined;
    _r2?: number | undefined;
    _text1?: string;
    _text2?: string;
}

// 定义虚拟摇杆的控制元素数组
const vpad: VPadControl[] = [
    // 第一个控制元素，用于移动和跳跃
    {_l: 0, _t: 0.5, _r: 0.5, _b: 1, _r1: PAD_MOVE_RADIUS_0, _r2: PAD_MOVE_RADIUS_1, _text1: "RUN", _text2: "JUMP"},
    // 第二个控制元素，用于瞄准和射击
    {_l: 0.5, _t: 0.5, _r: 1, _b: 1, _r1: PAD_FIRE_RADIUS_0, _r2: PAD_FIRE_RADIUS_1, _text1: "AIM", _text2: "FIRE"},
    // 第三个控制元素，用于丢弃道具
    {_l: 0.5, _t: 0.25, _r: 0.66, _b: 0.5, _isButton: 1, _r1: 16, _text1: "DROP"},
    // 第四个控制元素，用于手动装填武器
    {_l: 0.66, _t: 0.25, _r: 0.82, _b: 0.5, _isButton: 1, _r1: 16, _text1: "RELOAD"},
    // 第五个控制元素，用于切换武器
    {_l: 0.82, _t: 0.25, _r: 1, _b: 0.5, _isButton: 1, _r1: 16, _text1: "SWAP"},
];

// 标记触摸虚拟摇杆是否活跃的变量，默认为false
let touchPadActive = false;

// 检查指针是否可被捕获的函数
const checkPointerIsAvailableForCapturing = (pointer: Pointer) => !vpad.some(c => c._pointer == pointer);

// 测试指针是否在控制元素的区域内的函数
const testZone = (control: VPadControl, rx: number, ry: number) =>
    rx > control._l && rx < control._r && ry > control._t && ry < control._b;

// 更新虚拟摇杆的状态
const updateVirtualPad = () => {
    // 获取绘图区域的宽度和高度
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;

    // 遍历虚拟摇杆的控制元素
    for (const control of vpad) {
        // 如果控制元素未被捕获
        if (!control._pointer) {
            // 尝试捕获控制元素
            for (const [, p] of inputPointers) {
                if (
                    p._downEvent &&  // 如果当前指针正在按下
                    testZone(control, p._startX / W, p._startY / H) &&  // 并且指针位置在控制元素的范围内
                    checkPointerIsAvailableForCapturing(p)  // 并且指针可以被捕获
                ) {
                    control._pointer = p;  // 捕获控制元素
                }
            }
        }
        // 如果控制元素已被捕获
        if (control._pointer) {
            const p = control._pointer;
            let release = !p._active;  // 默认释放标志为指针不活跃
            // 如果控制元素是按钮类型，则进入区域外模式
            if (control._isButton) {
                release ||= !testZone(control, p._x / W, p._y / H);  // 如果指针位置在控制元素的范围外，则标记为释放
            }
            if (release) {
                // 释放控制元素
                control._pointer = undefined;
            } else {
                touchPadActive = true;  // 标记虚拟摇杆为活跃状态
            }
        }
    }

    // 如果鼠标指针按下事件发生，则标记虚拟摇杆为活跃状态
    if (mousePointer._downEvent) {
        touchPadActive = [...inputPointers.values()].some(p => p._active);
        // 使用解构方式获取输入指针的活跃状态，并返回是否有活跃状态的指针
    }
    return touchPadActive;  // 返回虚拟摇杆的活跃状态
};

// 绘制虚拟摇杆外观的函数
export const drawVirtualPad = () => {
    // 如果虚拟摇杆未激活，则直接返回，不进行绘制
    if (!touchPadActive) {
        return;
    }
    // 获取虚拟摇杆的纹理
    const boxTexture = fnt[0]._textureBox;
    // 获取绘图区域的宽度和高度
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    // 计算屏幕缩放比例
    const k = 1 / getScreenScale();
    // 定义圆的绘制细分段数
    const segments1 = 12;
    const segments2 = 16;
    
    // 遍历虚拟摇杆的控制元素
    for (const control of vpad) {
        // 如果控制元素被隐藏，则跳过绘制
        if (!control._hidden) {
            // 计算控制元素的宽度和高度
            const w_ = W * (control._r - control._l);
            const h_ = H * (control._b - control._t);
            // 计算控制元素的中心点坐标
            let cx = k * (W * control._l + w_ / 2);
            let cy = k * (H * control._t + h_ / 2);
            // 获取控制元素关联的指针
            const pp = control._pointer;
            // 如果控制元素不是按钮并且有指针关联，则重新计算中心点坐标
            if (!control._isButton && pp) {
                cx = pp._startX * k;
                cy = pp._startY * k;
                // 填充圆形作为指示
                fillCircle(boxTexture, pp._x * k, pp._y * k, 16, segments1, 1, 1, 0.5);
            }
            // 如果控制元素有半径1，则绘制相应的文本和圆圈
            if (control._r1 !== undefined) {
                drawTextAligned(fnt[0], control._text1, 8, cx, cy - control._r1 - 4, pp ? 0xffffff : 0x777777);
                strokeCircle(boxTexture, cx, cy, control._r1 - 2, 4, segments1, 1, 1, 0.5, pp ? 0xffffff : 0);
            }
            // 如果控制元素有半径2，则绘制相应的文本和圆圈
            if (control._r2 !== undefined) {
                drawTextAligned(fnt[0], control._text2, 8, cx, cy - control._r2 - 4, pp ? 0xffffff : 0x777777);
                strokeCircle(boxTexture, cx, cy, control._r2 - 2, 4, segments2, 1, 1, 0.5, pp ? 0xffffff : 0);
            }
        }
    }
};
