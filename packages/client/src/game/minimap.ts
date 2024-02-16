import {Actor, ActorType, PlayerActor, StateData} from "./types.js";
import {draw} from "../graphics/draw2d.js";
import {img} from "../assets/gfx.js";
import {WORLD_BOUNDS_SIZE, OBJECT_RADIUS} from "../assets/params.js";
import {clientId} from "../net/messaging.js";
import {PI} from "../utils/math.js";
import {GAME_CFG} from "./config.js";
import {fnt} from "../graphics/font.js";
import {Img} from "../assets/img.js";
import {TILE_MAP_STRIDE} from "./tilemap.js";

const getPlayerColor = (player: PlayerActor): number => {
    const config = GAME_CFG.minimap;
    if (!player._client) {
        return config.colors.npc;
    } else if (player._client === clientId) {
        return config.colors.me;
    }
    return config.colors.player;
};

const drawMiniMapList = (x: number, y: number, actors: Actor[] | undefined, color: number, r: number) => {
    if (actors) { // 如果角色数组不为空
        const config = GAME_CFG.minimap; // 获取迷你地图的配置
        const s = (config.markerScale * r) / OBJECT_RADIUS; // 计算图标的缩放比例
        const scale = config.size / WORLD_BOUNDS_SIZE; // 计算缩放比例
        for (const actor of actors) { // 遍历角色数组
            let c = color; // 设置绘制颜色
            if (actor._type === ActorType.Player) { // 如果当前角色是玩家
                c = getPlayerColor(actor as PlayerActor); // 获取玩家特定的颜色
            }
            // 在迷你地图上绘制角色图标
            draw(fnt[0]._textureBox, x + scale * actor._x, y + scale * actor._y, PI / 4, s, s, 1, c);
        }
    }
};

export const drawMiniMap = (state: StateData, staticTrees: Actor[], blocks: number[], right: number, top: number) => {
    const config = GAME_CFG.minimap; // 获取迷你地图的配置
    const size = config.size; // 获取迷你地图的大小
    const colors = config.colors; // 获取迷你地图的颜色配置
    const x = right - size - 1; // 计算迷你地图在画布中的 x 坐标
    const y = top + 1; // 计算迷你地图在画布中的 y 坐标
    
    // 绘制迷你地图的背景框
    draw(img[Img.box_lt], x, y, 0, size, size, colors.backgroundAlpha, colors.background);
    
    // 绘制地图中的静态物体
    {
        const sc = size / TILE_MAP_STRIDE; // 计算每个瓦片的尺寸
        for (let cy = 0; cy < TILE_MAP_STRIDE; ++cy) {
            for (let cx = 0; cx < TILE_MAP_STRIDE; ++cx) {
                const t = blocks[cx + cy * TILE_MAP_STRIDE]; // 获取当前瓦片的类型
                if (t === 1) { // 如果当前瓦片是树木
                    draw(img[Img.box_lt], x + sc * cx, y + sc * cy, 0, sc, sc, 1, colors.tree); // 绘制树木图标
                } else if (t === 3) { // 如果当前瓦片是其他静态物体
                    draw(img[Img.box_lt], x + sc * cx, y + sc * cy, 0, sc, sc, 1, 0xffffff); // 绘制其他静态物体图标
                }
            }
        }
    }
    
    // 绘制地图中的动态物体
    drawMiniMapList(x, y, staticTrees, colors.tree, GAME_CFG.actors[ActorType.Tree].radius); // 绘制树木的图标
    drawMiniMapList(x, y, state._actors[ActorType.Barrel], colors.barrel, GAME_CFG.actors[ActorType.Barrel].radius); // 绘制桶的图标
    drawMiniMapList(x, y, state._actors[ActorType.Item], colors.item, GAME_CFG.actors[ActorType.Item].radius); // 绘制物品的图标
    drawMiniMapList(x, y, state._actors[ActorType.Player], colors.player, GAME_CFG.actors[ActorType.Player].radius); // 绘制玩家的图标
};
