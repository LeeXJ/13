import {Actor} from "@iioi/client/game/types.js";
import {snd, Snd} from "@iioi/client/assets/sfx.js";
import {GAME_CFG} from "@iioi/client/game/config.js";
import {WORLD_SCALE} from "@iioi/client/assets/params.js";
import {gameCamera} from "@iioi/client/game/camera.js";
import {clamp, hypot} from "@iioi/client/utils/math.js";
import {play} from "@iioi/client/audio/context.js";
import {game} from "@iioi/client/game/gameState.js";

// 导出名为 playAt 的函数，它接受一个 actor 和一个 id 作为参数
export const playAt = (actor: Actor, id: Snd) => {
    // 检查当前游戏的游戏时钟是否大于上一个音频时钟
    if (game._gameTic > game._lastAudioTic) {
        // 获取摄像机的监听半径
        const r = GAME_CFG.camera.listenerRadius;
        // 计算 actor 相对于摄像机的相对位置
        const dx = (actor._x / WORLD_SCALE - gameCamera._x) / r;
        const dy = (actor._y / WORLD_SCALE - gameCamera._y) / r;
        // 计算声音的音量，取决于 actor 的距离
        const v = 1 - hypot(dx, dy);
        // 如果音量大于 0
        if (v > 0) {
            // 计算声音的位置，限制在 [-1, 1] 的范围内
            play(snd[id], v, clamp(dx, -1, 1));
        }
    }
};
