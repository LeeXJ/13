import {
    Actor,
    ActorType,
    BulletActor,
    ControlsFlag,
    ItemActor,
    ItemType,
    PlayerActor,
    unpackAngleByte,
} from "./types.js";
import {BOUNDS_SIZE, WORLD_BOUNDS_SIZE, WORLD_SCALE} from "../assets/params.js";
import {EMOJI, img} from "../assets/gfx.js";
import {
    ambientColor,
    beginRenderToMain,
    draw,
    drawMeshSprite,
    drawMeshSpriteUp,
    drawZ,
    emptyTexture,
    flush,
    gl,
    setDrawZ,
    setLightMapTexture,
    setMVP,
} from "../graphics/draw2d.js";
import {drawVirtualPad, lookAtX, lookAtY, viewX, viewY} from "./controls.js";
import {atan2, clamp, cos, hypot, max, min, PI, PI2, sin, TO_RAD} from "../utils/math.js";
import {mat4_create, mat4_makeXRotation, mat4_makeZRotation, mat4_mul, mat4_orthoProjectionLH} from "../utils/mat4.js";
import {getLumaColor32, RGB} from "../utils/utils.js";
import {ANIM_HIT_MAX, BULLET_RADIUS, OBJECT_RADIUS, PLAYER_HANDS_PX_Z, PLAYER_HANDS_Z} from "../assets/params.js";
import {Const, GAME_CFG} from "./config.js";
import {BulletType} from "../data/config.js";
import {fxRandElement, fxRandom, fxRandomNorm} from "../utils/rnd.js";
import {
    game,
    GameMenuState,
    gameMode,
    getMinTic,
    getMyPlayer,
    getNameByClientId,
    getPlayerByClient,
    JoinState,
    lastFrameTs,
} from "./gameState.js";
import {drawText, drawTextAligned, fnt} from "../graphics/font.js";
import {Img} from "../assets/img.js";
import {clientId, clientName, isPeerConnected, remoteClients} from "../net/messaging.js";
import {drawOpaqueParticles, drawParticleShadows, drawSplatsOpaque, drawTextParticles} from "./particles.js";
import {gameCamera, getScreenScale} from "@iioi/client/game/camera.js";
import {beginFogRender, drawFogObjects, drawFogPoint, fogTexture} from "@iioi/client/game/fog.js";
import {GL} from "@iioi/client/graphics/gl.js";
import {termPrint, ui_renderNormal, ui_renderOpaque} from "@iioi/client/graphics/gui.js";
import {mapTexture} from "@iioi/client/assets/map.js";
import {getDevFlag, SettingFlag} from "@iioi/client/game/settings.js";
import {drawCollisions, printDebugInfo} from "@iioi/client/game/debug.js";
import {drawMiniMap} from "@iioi/client/game/minimap.js";
import {stats} from "@iioi/client/utils/fpsMeter.js";
import {ClientID} from "@iioi/shared/types.js";
import {TILE_MAP_STRIDE, TILE_SIZE, TILE_SIZE_BITS} from "./tilemap.js";
import {RAYCAST_HITS, raycastWorld} from "./gamePhy.js";
import {TRACE_HIT, traceRay} from "../utils/collision/fastVoxelRaycast.js";
import {L} from "../assets/text.js";

export const drawShadows = (drawList: Actor[]) => {
    for (const actor of drawList) {
        const prop = GAME_CFG.actors[actor._type];
        const shadowScale = (2 - actor._z / (WORLD_SCALE * 64)) * prop.shadowScale;
        drawMeshSprite(
            img[Img.circle_4],
            actor._x / WORLD_SCALE,
            actor._y / WORLD_SCALE,
            0,
            shadowScale,
            shadowScale / 4,
            0.4,
            prop.shadowColor,
            prop.shadowAdd,
        );
    }
};

export const drawCrosshair = (player: PlayerActor | undefined, screenScale: number) => {
    if (player && (viewX | 0 || viewY | 0)) {
        const weapons = GAME_CFG.weapons;
        const img = fnt[0]._textureBoxT1;
        const W = gl.drawingBufferWidth;
        const H = gl.drawingBufferHeight;
        const x = ((lookAtX - gameCamera._x) / gameCamera._scale + W / 2) / screenScale;
        const y = ((lookAtY - gameCamera._y) / gameCamera._scale + H / 2) / screenScale;
        const t = lastFrameTs;
        // const x = lookAtX;
        // const y = lookAtY;
        if (player._weapon) {
            const weapon = weapons[player._weapon];
            if (weapon.clipSize) {
                if (player._clipReload && player._mags) {
                    // reloading
                    const t = 1.0 - player._clipReload / weapon.clipReload;
                    const N = 8;
                    for (let i = 0; i < N; ++i) {
                        const sc = clamp(t * N - i, 0, 1);
                        draw(img, x, y, (i / N) * PI * 2 - PI, 2 * sc, 5 - 2 * sc, 1, 0xffff99);
                    }
                    return;
                }
                if (!player._clipAmmo) {
                    // blinking
                    if (sin(t * 32) >= 0) {
                        for (let i = 0; i < 4; ++i) {
                            draw(img, x, y, t / 10 + (i * PI) / 2, 2, 4, 1, 0xff3333);
                        }
                    }
                    return;
                }
            }
        }

        const len = 4 + (sin(2 * t) * cos(4 * t)) / 4 + player._detune / 8 + player._lifetime / 10;
        for (let i = 0; i < 4; ++i) {
            draw(img, x, y, t / 10 + (i * PI) / 2, 2, len);
        }
    }
};

const mvp = mat4_create();
const projection = mat4_create();
const rotX = mat4_create();
const rotZ = mat4_create();
const translateNorm = mat4_create();
const translateScale = mat4_create();

export const setupWorldCameraMatrix = (x: number, y: number, scale: number, rx: number, rz: number) => {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const angleX = Math.PI / 4 + rx;
    mat4_orthoProjectionLH(projection, 0, w, h, 0, 1e5, -1e5);
    translateNorm[12] = -x;
    translateNorm[13] = -y;
    translateScale[0] = scale;
    translateScale[5] = scale * cos(angleX) * 2;
    translateScale[10] = scale;
    translateScale[12] = w / 2;
    translateScale[13] = h / 2;
    mat4_makeXRotation(rotX, angleX);
    mat4_makeZRotation(rotZ, rz);
    mat4_mul(mvp, rotZ, translateNorm);
    mat4_mul(mvp, rotX, mvp);
    mat4_mul(mvp, translateScale, mvp);
    mat4_mul(mvp, projection, mvp);
    setMVP(mvp);
};

export const getHitColorOffset = (anim: number) => getLumaColor32(0xff * min(1, (2 * anim) / ANIM_HIT_MAX));

export const drawObjectMesh2D = (p: Actor, id: number | Img, z = 0, scale = 1, oy = 0.0, color = 0xffffff) =>
    drawMeshSpriteUp(
        img[id],
        p._x / WORLD_SCALE,
        p._y / WORLD_SCALE + oy,
        p._z / WORLD_SCALE + z,
        0,
        scale,
        scale,
        1,
        color,
        0,
        getHitColorOffset(p._animHit),
    );

const drawBarrelOpaque = (p: Actor): void => drawObjectMesh2D(p, p._subtype + Img.barrel0);
const drawTreeOpaque = (p: Actor): void => drawObjectMesh2D(p, p._subtype + Img.tree0);

const drawItemOpaque = (item: ItemActor) => {
    if (item._lifetime) {
        const limit = GAME_CFG.items.lifetime >>> 1;
        if (item._lifetime < limit) {
            const f = 1 - item._lifetime / limit;
            const fr = 8 + 16 * f;
            if (sin((fr * (limit - item._lifetime)) / (Const.NetFq / 3)) >= 0.5) {
                return;
            }
        }
    }
    if (item._subtype & ItemType.Weapon) {
        const weapon = GAME_CFG.weapons[item._itemWeapon];
        drawObjectMesh2D(item, Img.weapon0 + item._itemWeapon, 4, 0.8, 0, weapon.gfxColor);
        if (item._subtype & ItemType.Ammo) {
            drawObjectMesh2D(item, Img.item0 + ItemType.Ammo, 8, 0.8, -0.1);
        }
    } /*if (cat == ItemCategory.Effect)*/ else {
        const t = lastFrameTs * 4 + item._anim0 / 25;
        drawObjectMesh2D(item, Img.item0 + item._subtype, BULLET_RADIUS / WORLD_SCALE + cos(t), 0.9 + 0.1 * sin(4 * t));
    }
};

const drawBullet = (bullet: BulletActor) => {
    const x = bullet._x / WORLD_SCALE;
    const y = bullet._y / WORLD_SCALE;
    const z = bullet._z / WORLD_SCALE;
    const a = atan2(bullet._v, bullet._u);
    const weapon = GAME_CFG.weapons[bullet._subtype];
    const bulletType = weapon?.bulletType ?? 0;
    const bulletData = GAME_CFG.bullets[bulletType];
    const color = fxRandElement(bulletData.color);
    let longing = bulletData.length;
    let longingH = bulletData.length / 2;
    let longing2 = bulletData.lightLength;
    const fade = bulletType === BulletType.Tracing ? bullet._lifetime / 16 : 1.0;
    const sz = bulletData.size + (bulletData.pulse * sin(32 * lastFrameTs + bullet._anim0)) / 2;
    if (bulletType === BulletType.Ray || bulletType === BulletType.Tracing) {
        const dist = hypot(bullet._x1 - bullet._x, bullet._y1 - bullet._y) / WORLD_SCALE;
        longing = dist / sz;
        longingH = dist / sz;
        longing2 = dist / 2;
    }
    setDrawZ(z - 0.1);
    drawMeshSprite(img[bulletData.images[0]], x, y, a, sz * longing, sz, 0.1, 0xffffff, 1);
    setDrawZ(z);
    drawMeshSprite(img[bulletData.images[1]], x, y, a, sz * longingH, sz / 2, fade, color);
    setDrawZ(z + 0.1);
    drawMeshSprite(img[bulletData.images[2]], x, y, a, 2 * longing2, 2, fade);
};

export const drawHotUsableHint = (hotUsable?: ItemActor) => {
    if (hotUsable) {
        if (hotUsable._subtype & ItemType.Weapon) {
            const weapons = GAME_CFG.weapons;
            const weapon = weapons[hotUsable._itemWeapon];
            let text = L(weapon.name) + " " + EMOJI[Img.weapon0 + hotUsable._itemWeapon];
            if (weapon.clipSize) {
                text += hotUsable._itemWeaponAmmo;
            }
            const x = hotUsable._x / WORLD_SCALE;
            const y = hotUsable._y / WORLD_SCALE + drawZ;
            drawTextAligned(fnt[0], text, 7, x, y - 28);
            drawTextAligned(fnt[0], L("pick_item") + " [E]", 7, x, y - 20);
        }
    }
};

const drawPlayerOpaque = (p: PlayerActor): void => {
    const co = getHitColorOffset(p._animHit);
    const basePhase = p._anim0 + lastFrameTs;
    const colorC = GAME_CFG.bodyColor[p._anim0 % GAME_CFG.bodyColor.length];
    const colorArm = colorC;
    const colorBody = colorC;
    const x = p._x / WORLD_SCALE;
    const y = p._y / WORLD_SCALE;
    const z = p._z / WORLD_SCALE;
    const speed = hypot(p._u, p._v, p._w);
    const runK = p._input & ControlsFlag.Run ? 1 : 0.8;
    const walk = min(1, speed / 100);
    let base = -0.5 * walk * 0.5 * (1.0 + sin(40 * runK * basePhase));
    const idle_base = (1 - walk) * ((1 + sin(10 * basePhase) ** 2) / 4);
    base = base + idle_base;
    const leg1 = 5 - 4 * walk * 0.5 * (1.0 + sin(40 * runK * basePhase));
    const leg2 = 5 - 4 * walk * 0.5 * (1.0 + sin(40 * runK * basePhase + PI));

    /////

    const weapons = GAME_CFG.weapons;
    const wpn = weapons[p._weapon];
    const viewAngle = unpackAngleByte(p._input >> ControlsFlag.LookAngleBit, ControlsFlag.LookAngleMax);
    const weaponBaseAngle = wpn.gfxRot * TO_RAD;
    const weaponBaseScaleX = wpn.gfxSx;
    const weaponBaseScaleY = 1;
    let weaponX = x;
    let weaponY = y;
    const weaponZ = z + PLAYER_HANDS_PX_Z;
    let weaponAngle = atan2(y + 1000 * sin(viewAngle) - weaponY + weaponZ, x + 1000 * cos(viewAngle) - weaponX);
    let weaponSX = weaponBaseScaleX;
    const weaponSY = weaponBaseScaleY;
    let weaponBack = 0;
    if (weaponAngle < -0.2 && weaponAngle > -PI + 0.2) {
        weaponBack = 1;
        //weaponY -= 16 * 4;
    }
    const A = sin(weaponAngle - PI);
    let wd = 6 + 12 * (weaponBack ? A * A : 0);
    let wx = 1;
    if (weaponAngle < -PI * 0.5 || weaponAngle > PI * 0.5) {
        wx = -1;
    }
    if (wpn.handsAnim) {
        // const t = max(0, (p.s - 0.8) * 5);
        // anim := 1 -> 0
        const t = min(
            1,
            wpn.launchTime > 0 ? p._lifetime / wpn.launchTime : max(0, (p._lifetime / wpn.reloadTime - 0.5) * 2),
        );
        wd += sin(t * PI) * wpn.handsAnim;
        weaponAngle -= -wx * PI * 0.25 * sin((1 - (1 - t) ** 2) * PI2);
    }
    weaponX += wd * cos(weaponAngle);
    weaponY += wd * sin(weaponAngle);

    if (wx < 0) {
        weaponSX *= wx;
        weaponAngle -= PI + 2 * weaponBaseAngle;
    }

    weaponAngle += weaponBaseAngle;

    if (p._weapon) {
        drawMeshSpriteUp(
            img[Img.weapon0 + p._weapon],
            weaponX,
            weaponY /* + (weaponBack ? -1 : 1)*/,
            weaponZ,
            weaponAngle,
            weaponSX,
            weaponSY,
            1,
            wpn.gfxColor,
        );
    }

    drawMeshSpriteUp(img[Img.box_t], x - 3, y, z + 5, 0, 2, leg1, 1, colorArm, 0, co);
    drawMeshSpriteUp(img[Img.box_t], x + 3, y, z + 5, 0, 2, leg2, 1, colorArm, 0, co);
    drawMeshSpriteUp(img[Img.box], x, y, z + 7 - base, 0, 8, 6, 1, colorBody, 0, co);

    // DRAW HANDS
    const rArmX = x + 4;
    const lArmX = x - 4;
    const armAY = y - z - PLAYER_HANDS_PX_Z + base * 2;
    const weaponAY = weaponY - weaponZ;
    const rArmRot = atan2(-armAY + weaponAY, weaponX - rArmX);
    const lArmRot = atan2(-armAY + weaponAY, weaponX - lArmX);
    const lArmLen = hypot(weaponX - lArmX, weaponAY - armAY) - 1;
    const rArmLen = hypot(weaponX - rArmX, weaponAY - armAY) - 1;

    if (p._weapon) {
        drawMeshSpriteUp(img[Img.box_l], x + 4, y + 0.2, z + 10 - base, rArmRot, rArmLen, 2, 1, colorArm, 0, co);
        drawMeshSpriteUp(img[Img.box_l], x - 4, y + 0.2, z + 10 - base, lArmRot, lArmLen, 2, 1, colorArm, 0, co);
    } else {
        let sw1 = walk * sin(20 * runK * basePhase);
        let sw2 = walk * cos(20 * runK * basePhase);
        let armLen = 5;
        if (!p._client && p._hp < 10 && !p._sp) {
            sw1 -= PI / 2;
            sw2 += PI / 2;
            armLen += 4;
        }
        drawMeshSpriteUp(img[Img.box_l], x + 4, y + 0.2, z + 10 - base, sw1 + PI / 4, armLen, 2, 1, colorArm, 0, co);
        drawMeshSpriteUp(
            img[Img.box_l],
            x - 4,
            y + 0.2,
            z + 10 - base,
            sw2 + PI - PI / 4,
            armLen,
            2,
            1,
            colorArm,
            0,
            co,
        );
    }

    {
        const imgHead = p._client ? Img.avatar0 + (p._anim0 % Img.num_avatars) : Img.npc0 + (p._anim0 % Img.num_npc);
        const s = p._w / 500;
        const a = p._u / 500;
        drawMeshSpriteUp(img[imgHead], x, y + 0.1, z + 16 - base * 2, a, 1 - s, 1 + s, 1, 0xffffff, 0, co);
    }
};

const drawPlayer = (p: PlayerActor): void => {
    const x = p._x / WORLD_SCALE;
    const y = p._y / WORLD_SCALE;

    if (p._client > 0) {
        if (p._client !== clientId) {
            let name = getNameByClientId(p._client);
            if (process.env.NODE_ENV === "development") {
                name = (name ?? "") + " #" + p._client;
            }
            if (name) {
                setDrawZ(32 + p._z / WORLD_SCALE);
                drawTextAligned(fnt[0], name, 6, x, y + 2);
            }
        } else {
            if (p._weapon) {
                const weapons = GAME_CFG.weapons;
                const weapon = weapons[p._weapon];
                if (weapon.laserSightSize) {
                    const color = weapon.laserSightColor;
                    const lookAngle = unpackAngleByte(p._input >> ControlsFlag.LookAngleBit, ControlsFlag.LookAngleMax);
                    const dx = cos(lookAngle);
                    const dy = sin(lookAngle);
                    const x = p._x + dx * WORLD_SCALE * weapon.offset;
                    const y = p._y + dy * WORLD_SCALE * weapon.offset;
                    const z = p._z + GAME_CFG.actors[p._type].height + PLAYER_HANDS_Z - 12 * WORLD_SCALE;

                    if (getDevFlag(SettingFlag.DevShowCollisionInfo)) {
                        traceRay(
                            game._blocks,
                            TILE_MAP_STRIDE,
                            x / (TILE_SIZE * WORLD_SCALE),
                            y / (TILE_SIZE * WORLD_SCALE),
                            dx,
                            dy,
                            (WORLD_BOUNDS_SIZE * 2.5) / (TILE_SIZE * WORLD_SCALE),
                            TRACE_HIT,
                        );

                        setDrawZ(0.1);
                        for (let i = 0; i < TRACE_HIT._traversed.length; i += 2) {
                            const tx = TRACE_HIT._traversed[i];
                            const ty = TRACE_HIT._traversed[i + 1];
                            drawMeshSprite(
                                img[Img.box_lt],
                                tx * TILE_SIZE,
                                ty * TILE_SIZE,
                                0,
                                TILE_SIZE,
                                TILE_SIZE,
                                0.5,
                                0x0000ff,
                            );
                        }
                        drawMeshSprite(
                            img[Img.circle_4],
                            TRACE_HIT._x * TILE_SIZE,
                            TRACE_HIT._y * TILE_SIZE,
                            0,
                            0.5,
                            0.5,
                            0.5,
                            0xffff00,
                        );
                        drawMeshSprite(
                            img[Img.box],
                            TRACE_HIT._x * TILE_SIZE + TRACE_HIT._nx * 4,
                            TRACE_HIT._y * TILE_SIZE + TRACE_HIT._ny * 4,
                            0,
                            2,
                            2,
                            0.5,
                            0xffff00,
                        );
                    }

                    const hits = RAYCAST_HITS;
                    raycastWorld(x, y, z, dx, dy, 0, hits, p._client);
                    if (hits._hasHits) {
                        const hit0 = hits._hits[0];
                        setDrawZ(z / WORLD_SCALE);
                        drawMeshSprite(
                            img[Img.box_l],
                            x / WORLD_SCALE,
                            y / WORLD_SCALE,
                            lookAngle,
                            hit0._t / WORLD_SCALE,
                            weapon.laserSightSize * (0.5 + fxRandom(0.5)),
                            0.2,
                            color,
                            1,
                            color,
                        );
                        setDrawZ((hits._z + hit0._t * hits._dz) / WORLD_SCALE);
                        drawMeshSprite(
                            img[Img.circle_4],
                            (hits._x + hit0._t * hits._dx) / WORLD_SCALE,
                            (hits._y + hit0._t * hits._dy) / WORLD_SCALE,
                            lookAngle,
                            fxRandom(),
                            fxRandom(),
                            0.5,
                            color,
                            1,
                            color,
                        );
                    }
                }
            }
        }
    }
};

type ActorDrawFunction = (p: Actor) => void;
const DRAW_BY_TYPE: ActorDrawFunction[] = [drawPlayer, undefined, drawBullet, undefined, undefined];

const DRAW_OPAQUE_BY_TYPE: (ActorDrawFunction | undefined)[] = [
    drawPlayerOpaque,
    drawBarrelOpaque,
    undefined,
    drawItemOpaque,
    drawTreeOpaque,
];

export const drawOpaqueObjects = (drawList: Actor[]) => {
    for (let i = drawList.length - 1; i >= 0; --i) {
        const actor = drawList[i];
        DRAW_OPAQUE_BY_TYPE[actor._type]?.(actor);
    }
};

export const drawObjects = (drawList: Actor[]) => {
    drawTilesShadows(game._blocks);
    setDrawZ(0.15);
    drawShadows(drawList);
    drawParticleShadows();
    for (const actor of drawList) {
        DRAW_BY_TYPE[actor._type]?.(actor);
    }
};

const drawList: Actor[] = [];

const checkBulletIsRayVisible = (bullet: BulletActor) => {
    const bulletType = GAME_CFG.weapons[bullet._subtype /* weaponID */].bulletType;
    return bulletType === BulletType.Ray || bulletType === BulletType.Tracing;
};

const collectVisibleActors = (...lists: Actor[][]) => {
    drawList.length = 0;
    const pad = (2 * OBJECT_RADIUS) / WORLD_SCALE;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const invScale = gameCamera._scale / 2;
    const l = -invScale * W + gameCamera._x - pad;
    const t = -invScale * H + gameCamera._y - pad - 128;
    const r = invScale * W + gameCamera._x + pad;
    const b = invScale * H + gameCamera._y + pad + 128;
    for (const list of lists) {
        for (const a of list) {
            const x = a._x / WORLD_SCALE;
            const y = a._y / WORLD_SCALE;
            if (
                (x > l && x < r && y > t && y < b) ||
                // TODO: optimize with end line [x1, y1]
                (a._type == ActorType.Bullet && checkBulletIsRayVisible(a as BulletActor))
            ) {
                drawList.push(a);
            }
        }
    }
};

export const drawGame = () => {
    // prepare objects draw list first
    collectVisibleActors(game._trees, ...game._state._actors);
    drawList.sort((a, b) => WORLD_BOUNDS_SIZE * (a._y - b._y) + a._x - b._x);

    beginFogRender();
    drawFogObjects(
        game._state._actors[ActorType.Player],
        game._state._actors[ActorType.Bullet],
        game._state._actors[ActorType.Item],
    );
    if (gameMode._title) {
        drawFogPoint(gameCamera._x, gameCamera._y, 3 + fxRandom(1), 1);
    }
    flush();

    gl.clear(GL.DEPTH_BUFFER_BIT);
    gl.clearDepth(1);
    gl.enable(GL.DEPTH_TEST);
    gl.depthFunc(GL.LESS);
    gl.depthMask(true);
    gl.depthRange(0, 1);

    beginRenderToMain(0, 0, 0, 0, 0, getScreenScale());
    ui_renderOpaque();
    flush();

    beginRenderToMain(gameCamera._x, gameCamera._y, 0.5, 0.5, 0.0, 1 / gameCamera._scale);

    {
        const shake = gameCamera._shake;
        const offsetX = gameCamera._feedback * gameCamera._feedbackX + (fxRandomNorm(shake / 5) | 0);
        const offsetY = gameCamera._feedback * gameCamera._feedbackY + (fxRandomNorm(shake / 5) | 0);
        const cameraCenterX = gameCamera._x + offsetX;
        const cameraCenterY = gameCamera._y + offsetY;
        const viewScale = 1 / gameCamera._scale;
        let fx = fxRandomNorm(shake / (8 * 50));
        let fz = fxRandomNorm(shake / (8 * 50));
        fx += gameMode._tiltCamera * Math.sin(lastFrameTs);
        fz += gameMode._tiltCamera * Math.cos(lastFrameTs);
        setupWorldCameraMatrix(cameraCenterX, cameraCenterY, viewScale, fx, fz);
    }

    {
        let redAdd = 0;
        let redPulse = 0;
        const player = getMyPlayer();
        if (player) {
            redAdd = ((getHitColorOffset(player._animHit) & 0x990000) >>> 16) / 0xff;
            const wounds = 1 - min(player._sp + player._hp, 10) / 10;
            if (wounds > 0 && wounds < 1) {
                redPulse += 0.3 * wounds * wounds;
                redPulse *= 0.5 + 0.5 * sin(lastFrameTs * 6);
            }
        }
        ambientColor[0] = clamp(0x33 / 0xff + (0x11 / 0xff) * sin(lastFrameTs) + redAdd + redPulse, 0, 1);
        ambientColor[1] = 0x11 / 0xff;
        ambientColor[2] = 0x33 / 0xff;
        ambientColor[3] = 0.8;
        setLightMapTexture(fogTexture._texture);
    }

    drawTiles(game._blocks);
    drawOpaqueParticles();
    drawOpaqueObjects(drawList);
    drawSplatsOpaque();
    flush();

    // gl.enable(GL.DEPTH_TEST);
    gl.depthFunc(GL.LEQUAL);
    gl.depthMask(false);

    setLightMapTexture(emptyTexture._texture);
    // skybox
    {
        const tex = fnt[0]._textureBoxLT;
        const fullAmbientColor = RGB(ambientColor[0] * 0xff, ambientColor[1] * 0xff, ambientColor[2] * 0xff);
        draw(tex, -1000, -1000, 0, BOUNDS_SIZE + 2000, 1001, 1, fullAmbientColor);
        draw(tex, -1000, BOUNDS_SIZE - 1, 0, BOUNDS_SIZE + 2000, 1001, 1, fullAmbientColor);
        draw(tex, -1000, 0, 0, 1001, BOUNDS_SIZE, 1, fullAmbientColor);
        draw(tex, BOUNDS_SIZE - 1, 0, 0, 1001, BOUNDS_SIZE, 1, fullAmbientColor);
    }
    flush();

    setLightMapTexture(fogTexture._texture);

    setDrawZ(0);
    draw(mapTexture, 0, 0);

    drawObjects(drawList);

    if (getDevFlag(SettingFlag.DevShowCollisionInfo)) {
        drawCollisions(drawList);
    }

    if (gameMode._title) {
        setDrawZ(1);
        for (let i = 10; i > 0; --i) {
            const a = 0.5 * sin(i / 4 + lastFrameTs * 16);
            const color = RGB((0x20 * (11 - i) + 0x20 * a) & 0xff, 0, 0);
            const scale = 1 + i / 100;
            const angle = (a * i) / 100;
            const i4 = i / 4;
            const y1 = gameCamera._y + i4;
            drawMeshSpriteUp(
                img[Img.logo_title],
                gameCamera._x + fxRandomNorm(i4),
                y1 + 40 + fxRandomNorm(i4),
                40,
                angle,
                scale,
                scale,
                1,
                color,
            );
        }
    }
    flush();

    setLightMapTexture(emptyTexture._texture);
    gl.depthRange(0.2, 0.6);
    gl.depthFunc(GL.LEQUAL);
    gl.depthMask(false);
    setDrawZ(0);
    drawTextParticles();
    drawHotUsableHint(game._hotUsable);
    flush();

    gl.disable(GL.DEPTH_TEST);
    gl.depthRange(0, 1);
};

export const drawOverlay = () => {
    setDrawZ(1000);
    const scale = getScreenScale();
    beginRenderToMain(0, 0, 0, 0, 0, scale);

    if (clientId) {
        drawMiniMap(game._state, game._trees, game._blocks, gl.drawingBufferWidth / scale, 0);
    }

    if (!gameMode._title) {
        printStatus();
        if (gameMode._menu === GameMenuState.InGame) {
            drawVirtualPad();
        }
    }

    if (getDevFlag(SettingFlag.DevShowFrameStats)) {
        drawText(
            fnt[0],
            `FPS: ${stats._fps} | DC: ${stats._drawCalls} |  ⃤ ${stats._triangles} | ∷${stats._vertices}`,
            4,
            2,
            5,
            0,
            0,
        );
    }

    if (getDevFlag(SettingFlag.DevShowDebugInfo)) {
        printDebugInfo(
            (game._lastState ?? game._state)._tic + 1,
            getMinTic(),
            lastFrameTs,
            game._prevTime,
            drawList,
            game._state,
            game._trees,
            game._clients,
        );
    }

    ui_renderNormal();

    if (gameMode._menu === GameMenuState.InGame && !gameMode._replay) {
        drawCrosshair(getMyPlayer(), scale);
    }

    flush();
};

const getWeaponInfoHeader = (wpn: number, ammo: number, reload = 0): string => {
    if (wpn) {
        const weapons = GAME_CFG.weapons;
        const weapon = weapons[wpn];
        let txt = EMOJI[Img.weapon0 + wpn];
        if (weapon.clipSize) {
            if (reload) {
                txt += (((100 * (weapon.clipReload - reload)) / weapon.clipReload) | 0) + "%";
            } else {
                txt += ammo;
            }
        } else {
            txt += "∞";
        }
        return txt;
    }
    return "";
};

const printStatus = () => {
    if (clientId) {
        if (game._joinState === JoinState.Joined) {
            const p0 = getMyPlayer();
            if (p0) {
                let str = "";
                const hp = p0._hp;
                for (let i = 0; i < 10; ) {
                    const o2 = hp > i++;
                    const o1 = hp > i++;
                    str += o1 ? "❤️" : o2 ? "💔" : "🖤";
                }
                const sp = p0._sp;
                for (let i = 0; i < 10; ) {
                    const o2 = sp > i++;
                    const o1 = sp > i++;
                    str += o1 ? "🛡" : o2 ? "🪖️️" : "";
                }
                termPrint(str);
                {
                    let wpnInfo = getWeaponInfoHeader(p0._weapon, p0._clipAmmo, p0._clipReload);
                    if (p0._weapon2) {
                        wpnInfo += " | " + getWeaponInfoHeader(p0._weapon2, p0._clipAmmo2);
                    }
                    termPrint(wpnInfo);
                }
                termPrint(`🧱${p0._mags}`);
            }
        } else {
            termPrint("joining");
        }

        const getPlayerIcon = (id?: ClientID) => {
            const player = getPlayerByClient(id);
            return player ? EMOJI[Img.avatar0 + (player._anim0 % Img.num_avatars)] : "👁️";
        };
        const getPlayerStatInfo = (id?: ClientID): string => {
            const stat = game._state._stats.get(id);
            return `|☠${stat?._frags ?? 0}|🪙${stat?._scores ?? 0}`;
        };

        if (gameMode._replay) {
            for (const [id, rc] of remoteClients) {
                termPrint(getPlayerIcon(id) + rc._name + getPlayerStatInfo(id));
            }
        } else {
            termPrint(getPlayerIcon(clientId) + clientName + getPlayerStatInfo(clientId));
            for (const [id, rc] of remoteClients) {
                let text = (isPeerConnected(rc) ? getPlayerIcon(id) : "🔴") + rc._name + getPlayerStatInfo(id);
                if (getDevFlag()) {
                    const cl = game._clients.get(id);
                    if (cl && cl._lag !== undefined) {
                        text += " " + cl._lag;
                    }
                }
                termPrint(text);
            }
        }
    }
};

// 定义一个名为 drawTiles 的函数，它接受一个名为 blocks 的数组作为参数
const drawTiles = (blocks: number[]) => {
    // 获取当前 WebGL 上下文的绘图缓冲区的宽度和高度
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    // 获取游戏相机的 X 和 Y 坐标
    const cameraX = gameCamera._x;
    const cameraY = gameCamera._y;
    // 计算相机的缩放因子的倒数，并将结果除以 2，并将结果赋给 invScale 变量
    const invScale = gameCamera._scale / 2;
    // 设置瓦片大小为常量 TILE_SIZE
    const sz = TILE_SIZE;
    // 设置绘制高度为 14
    const height = 14;
    // 计算左边界、顶部边界、右边界和底部边界
    const l = max(0, (-invScale * W + cameraX) >> TILE_SIZE_BITS);
    const t = max(0, (-invScale * H + cameraY) >> TILE_SIZE_BITS);
    const r = min(TILE_MAP_STRIDE - 1, (invScale * W + cameraX + sz) >> TILE_SIZE_BITS);
    const b = min(TILE_MAP_STRIDE - 1, (invScale * H + cameraY + sz) >> TILE_SIZE_BITS);
    // 循环遍历每个瓦片块
    for (let cy = b; cy >= t; --cy) {
        for (let cx = l; cx <= r; ++cx) {
            // 获取当前瓦片块的值
            const b = blocks[cy * TILE_MAP_STRIDE + cx];
            // 如果当前瓦片块的值存在（非零）
            if (b) {
                // 计算瓦片块的实际 X 和 Y 坐标
                const x = cx << TILE_SIZE_BITS;
                const y = cy << TILE_SIZE_BITS;
                // 设置绘制深度为 height
                setDrawZ(height);
                // 绘制一个正常方向的图像（mesh sprite），该图像为 Img.box_lt
                // 图像的左上角位于 (x, y)，大小为 sz，图层为 1，颜色为 0x444444，旋转角度为 0 度
                drawMeshSprite(img[Img.box_lt], x, y, 0, sz, sz, 1, 0x444444, 0, 0);
                // 如果当前瓦片块的值为 3
                if (b === 3) {
                    // 绘制一个朝上方向的图像（mesh sprite），该图像为 Img.box_lt
                    // 图像的左上角位于 (x, y + sz)，高度为 height，大小为 sz，图层为 1，颜色为 0x888888，旋转角度为 0 度
                    drawMeshSpriteUp(img[Img.box_lt], x, y + sz, height, 0, sz, height, 1, 0x888888, 0, 0);
                }
            }
        }
    }
};

// 定义一个名为 drawTilesShadows 的函数，它接受一个名为 blocks 的数组作为参数
const drawTilesShadows = (blocks: number[]) => {
    // 获取当前 WebGL 上下文的绘图缓冲区的宽度和高度
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    // 获取游戏相机的 X 和 Y 坐标
    const cameraX = gameCamera._x;
    const cameraY = gameCamera._y;
    // 计算相机的缩放因子的倒数，并将结果除以 2，并将结果赋给 invScale 变量
    const invScale = gameCamera._scale / 2;
    // 设置瓦片大小为常量 TILE_SIZE
    const sz = TILE_SIZE;
    // 计算左边界、顶部边界、右边界和底部边界
    const l = max(0, (-invScale * W + cameraX) >> TILE_SIZE_BITS);
    const t = max(0, (-invScale * H + cameraY) >> TILE_SIZE_BITS);
    const r = min(TILE_MAP_STRIDE - 1, (invScale * W + cameraX + sz) >> TILE_SIZE_BITS);
    const b = min(TILE_MAP_STRIDE - 1, (invScale * H + cameraY + sz) >> TILE_SIZE_BITS);
    // 设置绘制的 Z 轴深度
    setDrawZ(0.01);
    // 循环遍历每个瓦片块
    for (let cy = b; cy >= t; --cy) {
        for (let cx = l; cx <= r; ++cx) {
            // 获取当前瓦片块的值
            const b = blocks[cy * TILE_MAP_STRIDE + cx];
            // 如果当前瓦片块的值为 3
            if (b === 3) {
                // 计算瓦片块的实际 X 和 Y 坐标
                const x = cx << TILE_SIZE_BITS;
                const y = cy << TILE_SIZE_BITS;
                // 绘制一个图像的一部分（mesh sprite），该图像为 Img.box_lt
                // 图像的左上角位于 (x, y + sz)，大小为 sz，图层为 2，透明度为 0.4，旋转角度为 0 度
                drawMeshSprite(img[Img.box_lt], x, y + sz, 0, sz, 2, 0.4, 0, 0, 0);
            }
        }
    }
};
