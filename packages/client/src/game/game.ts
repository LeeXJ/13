import {ClientID, MessageField, MessageType} from "@iioi/shared/types.js";
import {
    _room,
    _sseState,
    clientId,
    disconnect,
    isPeerConnected,
    onGetGameState,
    remoteCall,
    remoteClients,
} from "../net/messaging.js";
import {speak} from "../audio/context.js";
import {_SEEDS, fxRandElement, rand, random, random1i} from "../utils/rnd.js";
import {channels_sendObjectData} from "../net/channels_send.js";
import {setPacketHandler} from "../net/channels.js";
import {Const, GAME_CFG} from "./config.js";
import {generateMapBackground} from "../assets/map.js";
import {
    Actor,
    ActorType,
    BarrelActor,
    BulletActor,
    Client,
    ClientEvent,
    cloneStateData,
    ControlsFlag,
    ItemActor,
    ItemType,
    newStateData,
    packAngleByte,
    packDirByte,
    Packet,
    PlayerActor,
    PlayerStat,
    StateData,
    unpackAngleByte,
} from "./types.js";
import {pack, readState, unpack, writeState} from "./packets.js";
import {abs, clamp, cos, dec1, lerp, lerpLog, max, min, PI2, reach, sin, sqrt} from "../utils/math.js";
import {
    couldBeReloadedManually,
    dropButton,
    jumpButtonDown,
    lookAtX,
    lookAtY,
    moveFast,
    moveX,
    moveY,
    reloadButton,
    resetPlayerControls,
    shootButtonDown,
    swapButton,
    updateControls,
    viewX,
    viewY,
} from "./controls.js";
import {Snd} from "../assets/sfx.js";
import {
    addBoneParticles,
    addDamageTextParticle,
    addFleshParticles,
    addImpactParticles,
    addLandParticles,
    addShellParticle,
    addStepSplat,
    addTextParticle,
    resetParticles,
    restoreParticles,
    saveParticles,
    spawnBloodRainParticle,
    updateMapTexture,
    updateParticles,
} from "./particles.js";
import {
    addPos,
    addRadialVelocity,
    addVelFrom,
    addVelocityDir,
    applyGroundFriction,
    checkBodyCollision,
    checkTileCollisions,
    collideWithBoundsA,
    copyPosFromActorCenter,
    limitVelocity,
    reflectVelocity,
    testIntersection,
    updateActorPhysics,
    updateAnim,
    updateBody,
} from "./phy.js";
import {
    ANIM_HIT_MAX,
    BOUNDS_SIZE,
    BULLET_RADIUS,
    OBJECT_RADIUS,
    PLAYER_HANDS_Z,
    WORLD_SCALE,
} from "../assets/params.js";
import {
    addPacketDebugState,
    assertPacketDebugState,
    resetDebugStateCache,
    saveDebugState,
    updateDebugInput,
} from "./debug.js";
import {addToGrid, queryGridCollisions} from "./grid.js";
import {getOrCreate} from "../utils/utils.js";
import {updateAI} from "./ai/npc.js";
import {drawGame, drawOverlay} from "./gameDraw.js";
import {getDevFlag, hasSettingsFlag, SettingFlag} from "./settings.js";
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
    normalizeStateData,
    resetLastFrameTs,
    updateFrameTime,
} from "./gameState.js";
import {newSeedFromTime} from "@iioi/shared/seed.js";
import {itemContainsAmmo, newActor, newBulletActor, newItemActor, newPlayerActor} from "./actors.js";
import {poki} from "../poki.js";
import {delay} from "../utils/delay.js";
import {onGameMenu} from "./gameMenu.js";
import {Img} from "../assets/img.js";
import {autoplayInput, updateAutoplay} from "./ai/common.js";
import {
    decCameraEffects,
    feedbackCameraExplosion,
    feedbackCameraShot,
    gameCamera,
    getScreenScale,
    restoreGameCamera,
    saveGameCamera,
} from "@iioi/client/game/camera.js";
import {playAt} from "@iioi/client/game/gameAudio.js";
import {addReplayTicEvents, beginRecording} from "@iioi/client/game/replay/recorder.js";
import {runReplayTics} from "@iioi/client/game/replay/viewer.js";
import {fromByteArray, toByteArray} from "@iioi/shared/base64.js";
import {RAYCAST_HITS, raycastWorld} from "./gamePhy.js";
import {BulletType, WeaponConfig} from "../data/config.js";
import {generateBlocks, MapSlot} from "./mapgen/walls.js";
import {TILE_SIZE} from "./tilemap.js";
import {logScreenView} from "../analytics.js";
import {L} from "../assets/text.js";

const createItemActor = (subtype: number): ItemActor => {
    const item = newItemActor(subtype);
    pushActor(item);
    return item;
};

const createRandomItem = (): ItemActor => createItemActor(rand(6));

const requireClient = (id: ClientID): Client =>
    getOrCreate(game._clients, id, () => ({
        _id: id,
        _tic: 0,
        _ts0: 0,
        _ts1: 0,
        _acknowledgedTic: 0,
    }));

const requireStats = (id: ClientID): PlayerStat => getOrCreate(game._state._stats, id, () => ({_frags: 0, _scores: 0}));

export const resetGame = () => {
    resetDebugStateCache();
    resetParticles();
    resetPlayerControls();

    game._clients.clear();
    game._localEvents.length = 0;
    game._receivedEvents.length = 0;

    game._state = newStateData();
    normalizeStateData(game._state);

    game._joinState = JoinState.Wait;
    game._gameTic = 1;
    game._waitToAutoSpawn = false;
    game._waitToSpawn = false;
    game._allowedToRespawn = false;

    resetLastFrameTs();
    game._lastInputTic = 0;
    game._lastInputCmd = 0;
    game._lastAudioTic = 0;
    console.log("reset game");

    gameMode._title = false;
    gameMode._runAI = true;
    gameMode._playersAI = false;
    gameMode._hasPlayer = true;
    gameMode._tiltCamera = 0.0;
    gameMode._npcLevel = 0;
    gameMode._bloodRain = false;
    gameMode._replay = undefined;
    gameMode._menu = GameMenuState.InGame;
};

let mapItemSlots: MapSlot[] = [];
let mapTreeSlots: MapSlot[] = [];
let mapSpawnSlots: MapSlot[] = [];
const recreateMap = (themeIdx: number, seed: number) => {
    // generate map
    _SEEDS[0] = seed;

    const mapSlotsMap = new Map<number, MapSlot>();
    generateBlocks(game._blocks, mapSlotsMap);
    const mapSlots = [...mapSlotsMap.values()];
    mapTreeSlots = mapSlots.filter(x => x._type === 0);
    mapItemSlots = mapSlots.filter(x => x._type === 1);
    mapSpawnSlots = mapSlots.filter(x => x._type === 2);

    console.info("tree slots:", mapTreeSlots.length);
    console.info("item slots:", mapItemSlots.length);
    console.info("free slots:", mapSpawnSlots.length);

    const theme = generateMapBackground(themeIdx, game._blocks);

    game._trees.length = 0;
    game._treesGrid.length = 0;
    const nextId = game._state._nextId;
    for (let i = 0; i < GAME_CFG.trees.initCount && mapTreeSlots.length; ++i) {
        const sloti = rand(mapTreeSlots.length);
        const slot = mapTreeSlots[sloti];
        mapTreeSlots.splice(sloti, 1);

        const tree = newActor(ActorType.Tree);
        tree._subtype = theme.treeGfx[rand(theme.treeGfx.length)];
        tree._hp = 0;
        // setRandomPosition(tree);
        tree._x = (slot._x + 0.5) * TILE_SIZE * WORLD_SCALE;
        tree._y = (slot._y + 0.5) * TILE_SIZE * WORLD_SCALE;
        game._trees.push(tree);
        addToGrid(game._treesGrid, tree);
    }

    _SEEDS[0] = game._state._seed;
    game._state._nextId = nextId;
};

const pushActor = <T extends Actor>(a: T) => {
    const list = game._state._actors[a._type as 0 | 1 | 2 | 3] as T[];
    if (process.env.NODE_ENV === "development") {
        console.assert(list && list.indexOf(a) < 0);
    }
    a._id = game._state._nextId++;
    list.push(a);
};

const initBarrels = () => {
    const count = GAME_CFG.barrels.initCount;
    const hp = GAME_CFG.barrels.hp;

    for (let i = 0; i < count && mapItemSlots.length; ++i) {
        const sloti = rand(mapItemSlots.length);
        const slot = mapItemSlots[sloti];
        mapItemSlots.splice(sloti, 1);

        const barrel: BarrelActor = newActor(ActorType.Barrel);
        barrel._hp = hp[0] + rand(hp[1] - hp[0]);
        barrel._subtype = rand(2);
        //setRandomPosition(barrel);
        barrel._x = slot._x * TILE_SIZE * WORLD_SCALE;
        barrel._y = slot._y * TILE_SIZE * WORLD_SCALE;

        pushActor(barrel);
    }
};

export const createSeedGameState = () => {
    console.log("create initial game state (first player)");
    game._joinState = JoinState.Sync;
    game._gameTic = 1;
    game._state._seed = _SEEDS[0];
    recreateMap(_room._mapTheme, _room._mapSeed);
    initBarrels();
};

export const createSplashState = () => {
    game._joinState = JoinState.Joined;
    game._gameTic = 1;
    game._state._seed = _SEEDS[0];
    recreateMap(Math.floor(Math.random() * 3), newSeedFromTime());
    for (let i = 0; i < 13; ++i) {
        const k = i / 13;
        const player = newPlayerActor();
        player._client = 1 + i;
        player._hp = 10;
        player._mags = 10;
        player._sp = 10;
        setCurrentWeapon(player, 1 + (i % (GAME_CFG.weapons.length - 1)));
        player._anim0 = i + rand(10) * Img.num_avatars;
        player._input = packAngleByte(k, ControlsFlag.LookAngleMax) << ControlsFlag.LookAngleBit;
        const D = 80 + 20 * sqrt(random());
        player._x = (BOUNDS_SIZE / 2 + D * cos(k * PI2)) * WORLD_SCALE;
        player._y = (BOUNDS_SIZE / 2 + D * sin(k * PI2) + 10) * WORLD_SCALE;
        pushActor(player);
    }
    gameCamera._x = gameCamera._y = BOUNDS_SIZE / 2;
    gameMode._hasPlayer = false;
    gameMode._tiltCamera = 0.05;
    gameMode._bloodRain = true;
    gameMode._title = true;
};

export const updateGame = (ts: number) => {
    updateFrameTime(ts);

    if (game._joinState === JoinState.Wait) {
        if (gameMode._replay) {
            game._gameTic = game._state._tic;
            _SEEDS[0] = game._state._seed;
            recreateMap(_room._mapTheme, _room._mapSeed);
            game._joinState = JoinState.Joined;
        } else if (clientId && !remoteClients.size) {
            createSeedGameState();
        }
    }

    if (clientId && game._joinState > JoinState.LoadingState) {
        onGameMenu(game._gameTic);
    }

    if (game._joinState === JoinState.Wait && remoteClients.size) {
        let maxState: StateData | null = null;
        let maxStateTic = 0;
        let maxStateOwner = 0;
        for (const [id, rc] of remoteClients) {
            if (isPeerConnected(rc)) {
                const client = game._clients.get(id);
                // if (client && client._ready) {
                if (client) {
                    if (!client._loadingState && !client._startState) {
                        console.info("loading state from " + id);
                        client._loadingState = true;
                        remoteCall(id, MessageType.State, "", response => {
                            const body = response[MessageField.Data] as string;
                            if (body) {
                                const state = newStateData();
                                const bytes = toByteArray(body);
                                const i32 = new Int32Array(bytes.buffer);
                                readState(state, i32, 0);
                                client._startState = state;
                            } else {
                                console.info("state from " + id + " is empty");
                            }
                            client._loadingState = false;
                        });
                    }
                    if (client._startState && client._startState._tic > maxStateTic) {
                        maxState = client._startState;
                        maxStateTic = client._startState._tic;
                        maxStateOwner = client._id;
                    }
                }
            }
        }
        if (maxState) {
            updateFrameTime(performance.now() / 1000);
            const tic = maxState._tic;
            console.info("setup state #", tic, "from client", maxStateOwner);

            game._joinState = JoinState.Sync;
            const prevGameTic = game._gameTic;
            game._gameTic = tic + 1;
            const ticDelta = max(0, prevGameTic - game._gameTic);
            console.info("tic-delta:", ticDelta, "new-game-tick:", game._gameTic, "prev-game-tic:", prevGameTic);
            game._prevTime = lastFrameTs - ticDelta / Const.NetFq;
            game._state = maxState;
            _SEEDS[0] = game._state._seed;
            recreateMap(_room._mapTheme, _room._mapSeed);
            normalizeStateData(game._state);
            resetDebugStateCache();
            saveDebugState(cloneStateData(game._state));

            game._lastInputTic = tic + 1 + Const.InputDelay;
            game._lastAudioTic = tic + 1;
            game._lastInputCmd = 0;
            game._localEvents.length = 0;
            game._receivedEvents = game._receivedEvents.filter(e => e._tic > tic);
            for (const [, client] of game._clients) {
                console.log("client ", client._id, "_acknowledgedTic:", client._acknowledgedTic, "_tic:", client._tic);
                // client._acknowledgedTic = tic;
                // client._tic = max(client._tic, tic);
            }
            const processedFrames = tryRunTicks(lastFrameTs, false);
            console.info("preprocessed ticks:", processedFrames);
        }
    }
    let predicted = false;
    if (game._joinState >= JoinState.Sync) {
        if (gameMode._replay) {
            runReplayTics(ts, simulateTic);
        } else {
            cleaningUpClients();
            tryRunTicks(lastFrameTs);
        }
        predicted = beginPrediction();
    }
    if (!document.hidden) {
        drawGame();
        drawOverlay();
        updateMapTexture(lastFrameTs);
    }
    updateDebugInput();

    if (game._joinState >= JoinState.Sync) {
        // check input before overlay, or save camera settings
        if (!gameMode._replay) {
            updatePlayerControls();
        }

        if (predicted) endPrediction();

        if (!gameMode._replay) {
            checkJoinSync();
            checkPlayerInput();
            // sendInput();
        }
    }
    if (!gameMode._replay) {
        sendInput();
    }
};

const getLocalEvent = (tic: number, _e?: ClientEvent): ClientEvent => {
    if (!(_e = game._localEvents.find(e => e._tic == tic))) {
        _e = {_tic: tic, _client: clientId};
        game._localEvents.push(_e);
    }
    return _e;
};

const getNextInputTic = (tic: number) =>
    tic + max(Const.InputDelay, ((lastFrameTs - game._prevTime) * Const.NetFq) | 0);

const updatePlayerControls = () => {
    const myPlayer = getMyPlayer();
    if (myPlayer) {
        if (gameMode._menu == GameMenuState.InGame && !hasSettingsFlag(SettingFlag.DevAutoPlay) && !gameMode._replay) {
            updateControls(myPlayer);
        } else {
            resetPlayerControls();
        }

        // process Auto-play tic
        if (hasSettingsFlag(SettingFlag.DevAutoPlay) && !gameMode._replay) {
            updateAutoplay(game._state, myPlayer._client);
        }
    }
};

const checkPlayerInput = () => {
    let inputTic = getNextInputTic(game._gameTic);
    const player = getMyPlayer();
    let input = 0;
    if (player && game._joinState === JoinState.Joined) {
        if (getDevFlag(SettingFlag.DevAutoPlay)) {
            input = autoplayInput;
        } else {
            if (moveX || moveY) {
                input |=
                    (packDirByte(moveX, moveY, ControlsFlag.MoveAngleMax) << ControlsFlag.MoveAngleBit) |
                    ControlsFlag.Move;
                if (moveFast) {
                    input |= ControlsFlag.Run;
                }
            }

            if (viewX || viewY) {
                input |= packDirByte(viewX, viewY, ControlsFlag.LookAngleMax) << ControlsFlag.LookAngleBit;
                if (shootButtonDown) {
                    input |= ControlsFlag.Fire;
                }
            }

            if (jumpButtonDown) {
                input |= ControlsFlag.Jump;
            }

            if (dropButton) {
                input |= ControlsFlag.Drop;
            }

            if (reloadButton) {
                input |= ControlsFlag.Reload;
            }

            if (swapButton) {
                input |= ControlsFlag.Swap;
            }
        }
    }

    // RESPAWN EVENT
    if (
        !gameMode._title &&
        clientId &&
        !game._waitToSpawn &&
        !player &&
        game._joinState === JoinState.Joined &&
        game._allowedToRespawn
    ) {
        if (/*isAnyKeyDown() || */ game._waitToAutoSpawn) {
            input |= ControlsFlag.Spawn;
            game._waitToSpawn = true;
            game._waitToAutoSpawn = false;
            game._allowedToRespawn = false;
        }
    }

    if (game._lastInputCmd !== input) {
        if (inputTic <= game._lastInputTic) {
            inputTic = game._lastInputTic + 1;
        }
        game._lastInputTic = inputTic;
        // copy flag in case of rewriting local event for ONE-SHOT events
        const g = getLocalEvent(inputTic);
        if (g._input & ControlsFlag.Spawn) {
            input |= ControlsFlag.Spawn;
        }

        getLocalEvent(inputTic)._input = input;
        game._lastInputCmd = input;
    }
};

const checkJoinSync = () => {
    if (game._joinState === JoinState.Sync) {
        for (const [id, rc] of remoteClients) {
            if (isPeerConnected(rc)) {
                const cl = game._clients.get(id);
                // if (!cl || cl._joinState < JoinState.Sync) {
                //     if (!cl || !cl._ready || cl._tic < game._gameTic) {
                if (!cl || !cl._isPlaying) {
                    console.log("syncing...");
                    return;
                }
            } else {
                console.log("still connecting...");
                return;
            }
        }
        game._joinState = JoinState.Joined;
        console.log("All in sync");
        // respawnPlayer();
        game._waitToSpawn = false;
        game._waitToAutoSpawn = true;
        game._allowedToRespawn = true;

        beginRecording(game._state);
    }
};

// get minimum tic that already received by
const getMinAckAndInput = (lastTic: number) => {
    for (const [, client] of game._clients) {
        if (lastTic > client._acknowledgedTic && client._isPlaying) {
            lastTic = client._acknowledgedTic;
        }
    }
    return lastTic;
};

const correctPrevTime = (netTic: number, ts: number) => {
    const lastTic = game._gameTic - 1;
    if (netTic === lastTic) {
        // limit predicted tics
        if (ts - game._prevTime > Const.InputDelay / Const.NetFq) {
            game._prevTime = lerp(game._prevTime, ts - Const.InputDelay / Const.NetFq, 0.01);
        }
    }
    if (lastTic + Const.InputDelay < netTic) {
        game._prevTime -= 1 / Const.NetFq;
    }
};

const tryRunTicks = (ts: number, correct = true): number => {
    const netTic = getMinTic();
    let frames = ((ts - game._prevTime) * Const.NetFq) | 0;
    let framesSimulated = 0;
    while (game._gameTic <= netTic && frames--) {
        simulateTic();
        ++framesSimulated;

        // compensate
        // we must try to keep netTic >= gameTic + Const.InputDelay
        game._prevTime += 1 / Const.NetFq;
    }
    if (correct) {
        correctPrevTime(netTic, ts);
    }

    if (game._joinState >= JoinState.Joined) {
        const lastTic = game._gameTic - 1;
        game._receivedEvents = game._receivedEvents.filter(v => v._tic > lastTic);
        const ackTic = getMinAckAndInput(lastTic);
        game._localEvents = game._localEvents.filter(v => v._tic > ackTic);
    }

    return framesSimulated;
};

const _packetBuffer = new Int32Array(1024 * 256);

const sendInput = () => {
    const lastTic = game._joinState >= JoinState.Sync ? game._gameTic - 1 : 0;
    for (const [id, rc] of remoteClients) {
        if (isPeerConnected(rc)) {
            const cl = requireClient(id);
            const inputTic = getNextInputTic(lastTic);
            if (inputTic > cl._acknowledgedTic) {
                cl._ts0 = performance.now() & 0x7fffffff;
                const packet: Packet = {
                    // _sync: (cl._isPlaying as never) | 0,
                    _joinState: game._joinState,
                    // send to Client info that we know already
                    _receivedOnSender: cl._tic,
                    // t: lastTic + simTic + Const.InputDelay,
                    _tic: inputTic,
                    _ts0: cl._ts0,
                    _ts1: cl._ts1,
                    _events: game._localEvents.filter(e => e._tic > cl._acknowledgedTic && e._tic <= inputTic),
                };
                //console.log(JSON.stringify(packet.events_));
                if (!cl._ready && game._joinState === JoinState.Joined) {
                    // FIXME:
                    //packet._state = game._state;
                    // cl._tic = game._state._tic;
                    // cl._acknowledgedTic = game._state._tic;
                }
                if (process.env.NODE_ENV === "development" && game._joinState === JoinState.Joined && clientId) {
                    addPacketDebugState(cl, packet, game._state);
                }
                // if(packet.events_.length) {
                //     console.info("SEND: " + JSON.stringify(packet.events_));
                // }
                channels_sendObjectData(rc, pack(packet, _packetBuffer));
            }
        }
    }
};

const processPacket = (sender: Client, data: Packet) => {
    sender._ts1 = data._ts0;
    sender._lag = (performance.now() & 0x7fffffff) - data._ts1;
    if (game._joinState === JoinState.Joined) {
        assertPacketDebugState(sender._id, data);
    }
    sender._joinState = data._joinState;
    //console.info("received packets from " + sender._id);
    if (!sender._ready && data._joinState >= JoinState.Sync) {
        sender._ready = true;
        sender._tic = 0;
        sender._acknowledgedTic = 0;
    }
    // ignore old packets
    if (data._tic > sender._tic && sender._ready) {
        sender._isPlaying = true;
        for (const e of data._events) {
            if (e._tic > sender._tic /*alreadyReceivedTic*/) {
                game._receivedEvents.push(e);
            }
        }
        sender._tic = data._tic;
    }
    // IMPORTANT TO NOT UPDATE ACK IF WE GOT OLD PACKET!! WE COULD TURN REMOTE TO THE PAST
    // just update last ack, now we know that Remote got `acknowledgedTic` amount of our tics,
    // then we will send only events from [acknowledgedTic + 1] index
    if (sender._acknowledgedTic < data._receivedOnSender) {
        // update ack
        //console.log("update _acknowledgedTic: " + data._receivedOnSender);
        sender._acknowledgedTic = data._receivedOnSender;
    }
};

onGetGameState(() => {
    try {
        if (game._joinState < JoinState.Sync) {
            return "";
        }
        const len = writeState(game._state, _packetBuffer, 0) << 2;
        const res = fromByteArray(new Uint8Array(_packetBuffer.buffer, 0, len));
        console.info("serializing game state #", game._state._tic, "byteLength:", len);
        return res;
    } catch (e) {
        console.warn("error serializing game state", e);
    }
});

setPacketHandler((from: ClientID, buffer: ArrayBuffer) => {
    if (_sseState < 3) {
        return;
    }
    processPacket(requireClient(from), unpack(from, new Int32Array(buffer)));
    if (document.hidden) {
        updateFrameTime(performance.now() / 1000);
        cleaningUpClients();
        if (tryRunTicks(lastFrameTs)) {
            sendInput();
        }
    }
});

let disconnectTimes = 0;

const cleaningUpClients = () => {
    for (const [id] of game._clients) {
        if (!remoteClients.has(id)) {
            game._clients.delete(id);
        }
    }

    if (clientId && game._joinState >= JoinState.Sync) {
        for (const [id, rc] of remoteClients) {
            if (game._clients.get(id)?._ready && !isPeerConnected(rc)) {
                if (++disconnectTimes > 60 * 5) {
                    disconnect("Timeout error: peer can't be connected for given time");
                }
                return;
            }
        }
    }
    disconnectTimes = 0;
};

/// Game logic

const setCurrentWeapon = (player: PlayerActor, weaponId: number) => {
    player._weapon = weaponId;
    const weapon = GAME_CFG.weapons[weaponId];
    if (weapon) {
        player._clipReload = 0;
        player._clipAmmo = weapon.clipSize;
    }
};

const dropWeapon1 = (player: PlayerActor) => {
    // 获取玩家当前的视角角度
    const lookAngle = unpackAngleByte(player._input >> ControlsFlag.LookAngleBit, ControlsFlag.LookAngleMax);
    // 计算视角方向的 x 和 y 分量
    const lookDirX = cos(lookAngle);
    const lookDirY = sin(lookAngle);

    // 创建一个武器道具对象
    const item = createItemActor(ItemType.Weapon);
    // 将道具对象的位置设置为玩家中心位置
    copyPosFromActorCenter(item, player);
    // 将道具对象的位置向前移动，与玩家的视角方向保持一致
    addPos(item, lookDirX, lookDirY, 0, OBJECT_RADIUS);
    // 将道具对象的速度设置为玩家的速度
    addVelFrom(item, player);
    // 将道具对象的速度朝特定方向增加一定值
    addVelocityDir(item, lookDirX, lookDirY, 0, 64);
    // 设置道具对象的武器类型和弹药数量
    item._itemWeapon = player._weapon;
    item._itemWeaponAmmo = player._clipAmmo;
    // 清空玩家当前持有的第一武器和对应的弹药数量
    player._weapon = 0;
    player._clipAmmo = 0;
};

const lateUpdateDropButton = (player: PlayerActor) => {
    // 如果玩家按下了丢弃物品的输入
    if (player._input & ControlsFlag.Drop) {
        // 如果丢弃物品的按下事件尚未触发过
        if (!(player._trig & ControlsFlag.DownEvent_Drop)) {
            // 设置丢弃物品的按下事件已触发
            player._trig |= ControlsFlag.DownEvent_Drop;
            // 如果玩家当前持有武器
            if (player._weapon) {
                // 丢弃第一武器
                dropWeapon1(player);
                // 如果玩家同时持有第二武器
                if (player._weapon2) {
                    // 切换武器槽
                    swapWeaponSlot(player);
                }
            }
        }
    } else {
        // 如果玩家未按下丢弃物品的按钮，则重置丢弃物品的按下事件
        player._trig &= ~ControlsFlag.DownEvent_Drop;
    }
};

const updateWeaponPickup = (item: ItemActor, player: PlayerActor) => {
    // 如果玩家按下了丢弃物品的输入
    if (player._input & ControlsFlag.Drop) {
        // 如果丢弃物品的按下事件尚未触发过
        if (!(player._trig & ControlsFlag.DownEvent_Drop)) {
            // 设置丢弃物品的按下事件已触发
            player._trig |= ControlsFlag.DownEvent_Drop;
            // 如果第二武器槽为空，则交换第一和第二武器
            if (!player._weapon2) {
                swapWeaponSlot(player);
            } else {
                // 如果第二武器槽被占用，则替换第一武器
                dropWeapon1(player);
            }
            // 设置当前武器为拾取的武器
            setCurrentWeapon(player, item._itemWeapon);
            // 如果拾取的物品是弹药类型，则增加弹匣数量
            if (item._subtype & ItemType.Ammo) {
                const itemMags = 1;
                // 将弹匣数量限制在最大值10以内
                player._mags = min(10, player._mags + itemMags);
            }
            // 设置玩家当前弹药数量为拾取的武器所包含的弹药数量
            player._clipAmmo = item._itemWeaponAmmo;
            // 播放拾取音效
            playAt(player, Snd.pick);
            // 重置拾取物品的生命值和类型
            item._hp = item._subtype = 0;
        }
    }
};

const isMyPlayer = (actor: PlayerActor) => clientId && actor._client === clientId && actor._type === ActorType.Player;

const pickItem = (item: ItemActor, player: PlayerActor) => {
    if (testIntersection(item, player)) {
        const withMyPlayer = isMyPlayer(player);
        if (item._subtype & ItemType.Weapon) {
            if (withMyPlayer && !game._hotUsable) {
                game._hotUsable = item;
            }
            // suck in mags
            if (itemContainsAmmo(item) && player._mags < 10) {
                const itemMags = 1;
                const freeQty = 10 - player._mags;
                const qty = clamp(0, itemMags, freeQty);
                player._mags = min(10, player._mags + qty);

                // clear Ammo bits
                item._subtype = ItemType.Weapon;

                playAt(player, Snd.pick);
                if (withMyPlayer) {
                    addTextParticle(item, `+${qty} 🧱`);
                }
            }
            updateWeaponPickup(item, player);
        } else {
            if (item._subtype === ItemType.Hp || item._subtype === ItemType.Hp2) {
                if (player._hp < 10) {
                    const qty = item._subtype === ItemType.Hp2 ? 2 : 1;
                    player._hp = min(10, player._hp + qty);
                    item._hp = item._subtype = 0;
                    playAt(player, Snd.heal);
                    if (withMyPlayer) {
                        addTextParticle(item, `+${qty} ♡`);
                    }
                }
            } else if (item._subtype === ItemType.Credit || item._subtype === ItemType.Credit2) {
                if (player._client) {
                    const stat = requireStats(player._client);
                    const qty = item._subtype === ItemType.Credit2 ? 5 : 1;
                    stat._scores += qty;
                    item._hp = item._subtype = 0;
                    playAt(player, Snd.pick);
                    if (withMyPlayer) {
                        addTextParticle(item, `+${qty} 💰`);
                    }
                }
            } else if (item._subtype === ItemType.Ammo) {
                if (player._mags < 10) {
                    const qty = 1;
                    player._mags = min(10, player._mags + qty);
                    item._hp = item._subtype = 0;
                    playAt(player, Snd.pick);
                    if (withMyPlayer) {
                        addTextParticle(item, `+${qty} 🧱`);
                    }
                }
            } else if (item._subtype === ItemType.Shield) {
                if (player._sp < 10) {
                    const qty = 1;
                    ++player._sp;
                    item._hp = item._subtype = 0;
                    playAt(player, Snd.med);
                    if (withMyPlayer) {
                        addTextParticle(item, `+${qty} ⛊`);
                    }
                }
            }
        }
    }
};

const updateGameCamera = () => {
    const getRandomPlayer = () => {
        const l = game._state._actors[ActorType.Player].filter(p => p._client && game._clients.has(p._client));
        return l.length ? l[((lastFrameTs / 5) | 0) % l.length] : undefined;
    };
    let scale = GAME_CFG.camera.baseScale;
    let cameraX = gameCamera._x;
    let cameraY = gameCamera._y;
    if ((clientId && !gameMode._title) || gameMode._replay) {
        const myPlayer = getMyPlayer();
        const p0 = myPlayer ?? getRandomPlayer();
        if (p0?._client) {
            const wpn = GAME_CFG.weapons[p0._weapon];
            const px = p0._x / WORLD_SCALE;
            const py = p0._y / WORLD_SCALE;
            cameraX = px;
            cameraY = py;
            const autoPlay = hasSettingsFlag(SettingFlag.DevAutoPlay);
            if (myPlayer && ((!autoPlay && !gameMode._replay) || gameMode._menu !== GameMenuState.InGame)) {
                if (gameMode._menu === GameMenuState.InGame) {
                    cameraX += wpn.cameraLookForward * (lookAtX - px);
                    cameraY += wpn.cameraLookForward * (lookAtY - py);
                    scale *= wpn.cameraScale;
                } else {
                    scale = GAME_CFG.camera.inGameMenuScale;
                }
            }
        }
    }
    gameCamera._x = lerp(gameCamera._x, cameraX, 0.1);
    gameCamera._y = lerp(gameCamera._y, cameraY, 0.1);
    gameCamera._scale = lerpLog(gameCamera._scale, scale / getScreenScale(), 0.05);

    decCameraEffects();
};

const checkBulletCollision = (bullet: BulletActor, actor: Actor) => {
    // 如果子弹有生命值（_hp）、类型（_subtype）和_ownerId属性
    if (
        bullet._hp &&
        bullet._subtype /* weaponID */ &&
        // 根据_ownerId判断是否为同一玩家的子弹
        (bullet._ownerId > 0 ? bullet._ownerId - ((actor as PlayerActor)._client | 0) : -bullet._ownerId - actor._id) &&
        // 检测子弹和角色是否相交
        testIntersection(bullet, actor)
    ) {
        // 如果相交，则调用hitWithBullet函数处理碰撞
        hitWithBullet(actor, bullet);
    }
};

const simulateTic = (prediction = false) => {
    game._processingPrediction = prediction;
    const processTicCommands = (tic: number) => {
        const tickEvents: ClientEvent[] = game._localEvents.concat(game._receivedEvents).filter(v => v._tic == tic);
        tickEvents.sort((a, b) => a._client - b._client);
        if (!prediction) {
            addReplayTicEvents(tic, tickEvents);
            if (clientId) {
                //  console.log("play #", tic, "events:", tickEvents);
            }
        }

        for (const cmd of tickEvents) {
            if (cmd._input !== undefined) {
                const player = getPlayerByClient(cmd._client);
                if (player) {
                    player._input = cmd._input;
                } else if (cmd._input & ControlsFlag.Spawn) {
                    const playerConfig = GAME_CFG.player;
                    const p = newPlayerActor();
                    p._client = cmd._client;
                    const pos = mapSpawnSlots[rand(mapSpawnSlots.length)];
                    p._x = pos._x * TILE_SIZE * WORLD_SCALE;
                    p._y = pos._y * TILE_SIZE * WORLD_SCALE;

                    if (clientId == cmd._client) {
                        gameCamera._x = p._x / WORLD_SCALE;
                        gameCamera._y = p._y / WORLD_SCALE;
                    }
                    p._hp = playerConfig.hp;
                    p._sp = playerConfig.sp;
                    p._mags = playerConfig.mags;
                    // p._input = cmd._input;
                    setCurrentWeapon(p, playerConfig.startWeapon[rand(playerConfig.startWeapon.length)]);
                    pushActor(p);
                }
            }
        }
    };
    processTicCommands(game._gameTic);

    updateGameCamera();

    game._playersGrid.length = 0;
    game._barrelsGrid.length = 0;

    for (const a of game._state._actors[ActorType.Player]) {
        updatePlayer(a);
        addToGrid(game._playersGrid, a);
        a._localStateFlags = 1;
    }

    for (const a of game._state._actors[ActorType.Barrel]) {
        updateActorPhysics(a, game._blocks);
        addToGrid(game._barrelsGrid, a);
        a._localStateFlags = 1;
    }

    game._hotUsable = undefined;
    for (const item of game._state._actors[ActorType.Item]) {
        updateActorPhysics(item, game._blocks);
        if (!item._animHit) {
            queryGridCollisions(item, game._playersGrid, pickItem);
        }
        if (item._hp && item._lifetime) {
            if (game._gameTic % 3 === 0) {
                --item._lifetime;
                if (!item._lifetime) {
                    item._hp = 0;
                }
            }
        }
    }

    for (const player of game._state._actors[ActorType.Player]) {
        lateUpdateDropButton(player);
    }

    for (const bullet of game._state._actors[ActorType.Bullet]) {
        const weapon = getBulletWeapon(bullet);
        if (weapon) {
            const bulletType = weapon.bulletType;
            if (bulletType != BulletType.Ray) {
                updateBody(bullet, 0, 0);
                if (bulletType != BulletType.Tracing) {
                    if (bullet._hp && (collideWithBoundsA(bullet) || checkTileCollisions(bullet, game._blocks))) {
                        --bullet._hp;
                        addImpactParticles(8, bullet, bullet, GAME_CFG.bullets[bulletType].color);
                    }
                    queryGridCollisions(bullet, game._playersGrid, checkBulletCollision);
                    queryGridCollisions(bullet, game._barrelsGrid, checkBulletCollision);
                    queryGridCollisions(bullet, game._treesGrid, checkBulletCollision);
                }
            }
        }
        if (bullet._lifetime && !--bullet._lifetime) {
            bullet._hp = 0;
        }
    }
    game._state._actors[0] = game._state._actors[0].filter(x => x._hp > 0);
    game._state._actors[1] = game._state._actors[1].filter(x => x._hp > 0);
    game._state._actors[2] = game._state._actors[2].filter(x => x._hp > 0);
    game._state._actors[3] = game._state._actors[3].filter(x => x._hp > 0);

    for (const a of game._state._actors[ActorType.Player]) {
        a._localStateFlags = 0;
        queryGridCollisions(a, game._treesGrid, checkBodyCollision);
        queryGridCollisions(a, game._barrelsGrid, checkBodyCollision);
        queryGridCollisions(a, game._playersGrid, checkBodyCollision, 0);
    }
    for (const a of game._state._actors[ActorType.Barrel]) {
        a._localStateFlags = 0;
        queryGridCollisions(a, game._treesGrid, checkBodyCollision);
        queryGridCollisions(a, game._barrelsGrid, checkBodyCollision, 0);
    }

    if (game._waitToSpawn && getMyPlayer()) {
        if (!gameMode._replay) {
            poki._gameplayStart();
        }
        game._waitToSpawn = false;
    }

    for (const tree of game._trees) {
        updateAnim(tree);
    }

    updateParticles();

    if (gameMode._npcLevel) {
        const npcLevelConfig = GAME_CFG.npc[gameMode._npcLevel];
        const NPC_PERIOD_MASK = (1 << npcLevelConfig.period) - 1;
        if ((game._gameTic & NPC_PERIOD_MASK) === 0) {
            let count = 0;
            for (const player of game._state._actors[ActorType.Player]) {
                if (!player._client) {
                    ++count;
                }
            }
            // while (count < GAME_CFG.npc.max) {
            if (count < npcLevelConfig.max) {
                const p = newPlayerActor();
                const pos = mapSpawnSlots[rand(mapSpawnSlots.length)];
                p._x = pos._x * TILE_SIZE * WORLD_SCALE;
                p._y = pos._y * TILE_SIZE * WORLD_SCALE;
                p._hp = 10;
                p._mags = 1;
                setCurrentWeapon(p, rand(npcLevelConfig.initWeaponLen));
                pushActor(p);
                ++count;
            }
        }
    }

    if (game._lastAudioTic < game._gameTic) {
        game._lastAudioTic = game._gameTic;
    }

    game._state._seed = _SEEDS[0];
    game._state._tic = game._gameTic++;
    normalizeStateData(game._state);

    if (process.env.NODE_ENV === "development" && !prediction && clientId) {
        saveDebugState(cloneStateData(game._state));
    }

    // local updates
    if (gameMode._bloodRain && !prediction) {
        spawnBloodRainParticle();
    }

    // reset prediction flag
    game._processingPrediction = false;
};

const kill = (actor: Actor) => {
    playAt(actor, Snd.death);
    const amount = 1 + rand(3);
    const player = actor._type == ActorType.Player ? (actor as PlayerActor) : null;

    let dropWeapon1 = 0;
    if (actor._type === ActorType.Barrel && actor._subtype < 2) {
        const weaponChance = GAME_CFG.barrels.dropWeapon.chance;
        const weaponMin = GAME_CFG.barrels.dropWeapon.min;
        if (rand(100) < weaponChance) {
            dropWeapon1 = weaponMin + rand(GAME_CFG.weapons.length - weaponMin);
        }
    } else if (player?._weapon) {
        dropWeapon1 = player._weapon;
        player._weapon = 0;
    }

    for (let i = 0; i < amount; ++i) {
        const item = createRandomItem();
        copyPosFromActorCenter(item, actor);
        addVelFrom(item, actor);
        const v = 16 + 48 * sqrt(random());
        addRadialVelocity(item, random(PI2), v, v);
        limitVelocity(item, 64);
        if (dropWeapon1) {
            item._subtype = ItemType.Weapon;
            item._itemWeapon = dropWeapon1;
            const weapon = GAME_CFG.weapons[dropWeapon1];
            item._itemWeaponAmmo = weapon.clipSize;
            if (weapon.clipSize) {
                item._subtype |= ItemType.Ammo;
            }
            dropWeapon1 = 0;
        } else if (player?._weapon2) {
            item._subtype = ItemType.Weapon;
            item._itemWeapon = player._weapon2;
            const weapon = GAME_CFG.weapons[player._weapon2];
            item._itemWeaponAmmo = weapon.clipSize;
            if (weapon.clipSize) {
                item._subtype |= ItemType.Ammo;
            }
            player._weapon2 = 0;
        }
    }
    if (player) {
        const grave = newActor(ActorType.Barrel);
        copyPosFromActorCenter(grave, actor);
        addVelFrom(grave, actor);
        grave._w += 32;
        grave._hp = 15;
        grave._sp = 4;
        grave._subtype = 2;
        pushActor(grave);

        addFleshParticles(256, actor, 128, grave);
        addBoneParticles(32, actor, grave);

        if (!gameMode._replay && !game._processingPrediction) {
            if (player === getMyPlayer()) {
                poki._gameplayStop();
                delay(1000)
                    .then(poki._commercialBreak)
                    .then(() => {
                        gameMode._menu = GameMenuState.Respawn;
                        gameMode._respawnStartTic = game._gameTic;
                        game._allowedToRespawn = true;
                        logScreenView("respawn_screen");
                    });
            }
        }
    }

    feedbackCameraExplosion(25, actor._x, actor._y);
};

const getBulletWeapon = (bullet: BulletActor): WeaponConfig | undefined => {
    // 如果子弹的类型不为空
    if (bullet._subtype) {
        // 返回对应类型的武器配置
        return GAME_CFG.weapons[bullet._subtype];
    }
};

const hitWithBullet = (actor: Actor, bullet: BulletActor, bulletImpactParticles = true) => {
    const weapon = getBulletWeapon(bullet);
    let absorbed = false;
    addVelFrom(actor, bullet, 0.1);
    actor._animHit = ANIM_HIT_MAX;
    if (weapon && bulletImpactParticles) {
        addImpactParticles(8, bullet, bullet, GAME_CFG.bullets[weapon.bulletType].color);
    }
    playAt(actor, Snd.hit);
    if (actor._hp && weapon) {
        const critical = rand(100) < weapon.criticalHitChance;
        let damage = weapon.bulletDamage * (critical ? 2 : 1);
        if (actor._type === ActorType.Player) {
            addDamageTextParticle(actor, "" + damage, critical);
        }
        if (actor._sp > 0) {
            const q = clamp(damage, 0, actor._sp);
            if (q > 0) {
                actor._sp -= q;
                damage -= q;
                if (actor._type === ActorType.Player) {
                    addImpactParticles(16, actor, bullet, [0x999999, 0x00cccc, 0xffff00]);
                    playAt(actor, Snd.hurt);
                }
                absorbed = true;
            }
        }
        if (damage) {
            const q = clamp(damage, 0, actor._hp);
            if (q > 0) {
                actor._hp -= q;
                damage -= q;
                if (actor._type === ActorType.Player) {
                    addFleshParticles(16, actor, 64, bullet);
                    playAt(actor, Snd.hurt);
                }
                absorbed = true;
            }
        }
        if (damage) {
            // over-damage effect
        }

        if (!actor._hp) {
            // could be effect if damage is big
            kill(actor);
            if (actor._type === ActorType.Player) {
                const player = actor as PlayerActor;
                // reset frags on death
                const killed = game._state._stats.get(player._client);
                if (killed) {
                    killed._frags = 0;
                }

                const killerID = bullet._ownerId;
                if (killerID > 0) {
                    const stat: PlayerStat = game._state._stats.get(killerID) ?? {_scores: 0, _frags: 0};
                    const q = player._client > 0 ? 5 : 1;
                    stat._scores += q;
                    const killerPlayer = getPlayerByClient(killerID);
                    if (killerPlayer) {
                        addTextParticle(killerPlayer, `+${q} 💰`);
                    }
                    ++stat._frags;
                    game._state._stats.set(killerID, stat);
                    if (hasSettingsFlag(SettingFlag.Speech) && game._gameTic > game._lastAudioTic) {
                        const a = getNameByClientId(killerID);
                        const b = getNameByClientId(player._client);
                        if (a) {
                            let text = fxRandElement(b ? GAME_CFG.voice.killAB : GAME_CFG.voice.killNPC);
                            text = text.replace("{0}", a);
                            text = text.replace("{1}", b);
                            speak(text);
                        }
                    }
                }
            }
        }
    }

    if (bullet._hp && weapon && weapon.bulletType != BulletType.Ray && weapon.bulletType != BulletType.Tracing) {
        // bullet hit or bounced?
        if (absorbed) {
            bullet._hp = 0;
        } else {
            --bullet._hp;
            if (bullet._hp) {
                let nx = bullet._x - actor._x;
                let ny = bullet._y - actor._y;
                const dist = sqrt(nx * nx + ny * ny);
                if (dist > 0) {
                    nx /= dist;
                    ny /= dist;
                    reflectVelocity(bullet, nx, ny, 1);
                    const pen = GAME_CFG.actors[actor._type].radius + BULLET_RADIUS + 1;
                    bullet._x = actor._x + pen * nx;
                    bullet._y = actor._y + pen * ny;
                }
            }
        }
    }
};

const swapWeaponSlot = (player: PlayerActor) => {
    // 保存当前武器和弹药到临时变量
    const weapon = player._weapon;
    const ammo = player._clipAmmo;

    // 将第二武器和弹药分别赋值给当前武器和弹药
    player._weapon = player._weapon2;
    player._clipAmmo = player._clipAmmo2;

    // 将临时变量中保存的当前武器和弹药赋值给第二武器和弹药
    player._weapon2 = weapon;
    player._clipAmmo2 = ammo;
};

const needReloadWeaponIfOutOfAmmo = (player: PlayerActor) => {
    // 获取武器配置
    const weapons = GAME_CFG.weapons;

    // 如果玩家有武器，并且当前没有正在进行的弹夹重新装填
    if (player._weapon && !player._clipReload) {
        const weapon = weapons[player._weapon];

        // 如果武器具有弹夹大小，且当前弹夹为空
        if (weapon.clipSize && !player._clipAmmo) {
            // 如果玩家有备用弹夹
            if (player._mags) {
                // 开始自动重新装填
                player._clipReload = weapon.clipReload;
            }
            // 否则自动切换到可用的满弹药的武器
            else {
                // 如果玩家有第二武器，并且第二武器有弹药，或者没有弹夹大小（即无需弹药）
                if (player._weapon2 && (player._clipAmmo2 || !weapons[player._weapon2].clipSize)) {
                    // 切换武器槽
                    swapWeaponSlot(player);
                }

                // 如果当前是我的玩家，并且没有触发开火事件
                if (isMyPlayer(player) && !(player._trig & ControlsFlag.DownEvent_Fire)) {
                    // 添加文字粒子效果显示“武器为空”
                    addTextParticle(player, L("weapon_empty"));
                }

                // 设置玩家生命周期为当前武器的重新装填时间
                player._lifetime = weapon.reloadTime;
            }
        }
    }
};

const calcVelocityWithWeapon = (player: PlayerActor, velocity: number): number => {
    // 如果玩家有武器，则使用该武器的移动权重系数，否则默认为1.0
    const k = player._weapon ? GAME_CFG.weapons[player._weapon].moveWeightK : 1.0;
    // 计算带有武器时的速度，并将结果取整
    return (velocity * k) | 0;
};

const updatePlayer = (player: PlayerActor) => {
    if (gameMode._runAI && (!player._client || gameMode._playersAI)) {
        updateAI(game._state, player);
    }
    let landed = player._z == 0 && player._w == 0;
    if (player._input & ControlsFlag.Jump) {
        if (landed) {
            player._z = 1;
            player._w = calcVelocityWithWeapon(player, GAME_CFG.player.jumpVel);
            landed = false;
            playAt(player, Snd.jump);
            addLandParticles(player, 240, 8);
        }
    }
    const c = (landed ? 16 : 8) / Const.NetFq;
    const moveAngle = unpackAngleByte(player._input >> ControlsFlag.MoveAngleBit, ControlsFlag.MoveAngleMax);
    const lookAngle = unpackAngleByte(player._input >> ControlsFlag.LookAngleBit, ControlsFlag.LookAngleMax);
    const moveDirX = cos(moveAngle);
    const moveDirY = sin(moveAngle);
    const lookDirX = cos(lookAngle);
    const lookDirY = sin(lookAngle);
    if (player._input & ControlsFlag.Move) {
        const vel = calcVelocityWithWeapon(
            player,
            player._input & ControlsFlag.Run ? GAME_CFG.player.runVel : GAME_CFG.player.walkVel,
        );
        player._u = reach(player._u, vel * moveDirX, vel * c);
        player._v = reach(player._v, vel * moveDirY, vel * c);
        if (landed) {
            const L = 256;
            const S = (L / vel) | 0;
            const moment = (game._gameTic + player._anim0) % S;
            if (!moment) {
                if (!random1i(4)) {
                    addLandParticles(player, 240, 1);
                }
                const moment2 = (game._gameTic + player._anim0) % (2 * S);
                addStepSplat(player, moment2 ? 120 : -120);

                const moment4 = (game._gameTic + player._anim0) % (4 * S);
                if (!moment4) {
                    playAt(player, Snd.step);
                }
            }
        }
    } else {
        applyGroundFriction(player, 32 * c);
    }

    if (player._input & ControlsFlag.Swap) {
        if (!(player._trig & ControlsFlag.DownEvent_Swap)) {
            player._trig |= ControlsFlag.DownEvent_Swap;
            if (player._weapon2) {
                swapWeaponSlot(player);
            }
        }
    } else {
        player._trig &= ~ControlsFlag.DownEvent_Swap;
    }

    if (player._weapon) {
        const weapon = GAME_CFG.weapons[player._weapon];
        // Reload button
        if (player._input & ControlsFlag.Reload) {
            if (couldBeReloadedManually(player)) {
                if (player._mags) {
                    player._clipReload = weapon.clipReload;
                } else {
                    if (isMyPlayer(player) && !(player._trig & ControlsFlag.DownEvent_Reload)) {
                        addTextParticle(player, L("weapon_no_mags"));
                    }
                }
            }
            player._trig |= ControlsFlag.DownEvent_Reload;
        } else {
            player._trig &= ~ControlsFlag.DownEvent_Reload;
        }
        if (weapon.clipSize && player._clipReload && player._mags) {
            --player._clipReload;
            if (!player._clipReload) {
                --player._mags;
                player._clipAmmo = weapon.clipSize;
            }
        }
        if (player._input & ControlsFlag.Fire) {
            // reload-tics = NetFq / Rate
            player._lifetime = dec1(player._lifetime);
            if (!player._lifetime) {
                needReloadWeaponIfOutOfAmmo(player);
                const loaded = !weapon.clipSize || (!player._clipReload && player._clipAmmo);
                if (loaded) {
                    if (weapon.clipSize) {
                        --player._clipAmmo;
                        if (!player._clipAmmo) {
                            needReloadWeaponIfOutOfAmmo(player);
                        }
                    }
                    if (isMyPlayer(player)) {
                        feedbackCameraShot(weapon, lookDirX, lookDirY);
                    }
                    player._lifetime = weapon.reloadTime;
                    player._detune = reach(player._detune, weapon.detuneSpeed, 1);
                    if (player._z <= 0) {
                        addVelocityDir(player, lookDirX, lookDirY, -1, -weapon.kickBack);
                    }
                    playAt(player, Snd.shoot);
                    for (let i = 0; i < weapon.spawnCount; ++i) {
                        const a =
                            lookAngle +
                            weapon.angleVar * (random() - 0.5) +
                            weapon.angleSpread * (player._detune / weapon.detuneSpeed) * (random() - 0.5);
                        const dx = cos(a);
                        const dy = sin(a);
                        const bulletVelocity = weapon.velocity + weapon.velocityVar * (random() - 0.5);
                        const bullet = newBulletActor(player._client || -player._id, player._weapon);
                        bullet._hp = weapon.bulletHp;
                        bullet._lifetime = weapon.bulletLifetime;
                        copyPosFromActorCenter(bullet, player);
                        addPos(bullet, dx, dy, 0, WORLD_SCALE * weapon.offset);
                        bullet._z += PLAYER_HANDS_Z - 12 * WORLD_SCALE;
                        addVelocityDir(bullet, dx, dy, 0, bulletVelocity);
                        pushActor(bullet);
                        if (weapon.bulletType == BulletType.Ray || weapon.bulletType == BulletType.Tracing) {
                            const bulletConfig = GAME_CFG.bullets[weapon.bulletType];
                            let penetrationsLeft = bulletConfig.rayPenetrations;
                            const hits = RAYCAST_HITS;
                            raycastWorld(
                                bullet._x,
                                bullet._y,
                                bullet._z,
                                bullet._u,
                                bullet._v,
                                bullet._w,
                                hits,
                                bullet._ownerId,
                            );
                            for (const hit of hits._hits) {
                                --penetrationsLeft;
                                bullet._x1 = (hits._x + hit._t * hits._dx) | 0;
                                bullet._y1 = (hits._y + hit._t * hits._dy) | 0;
                                addImpactParticles(
                                    8,
                                    {
                                        _x: bullet._x1,
                                        _y: bullet._y1,
                                        _z: bullet._z,
                                        _type: bullet._type,
                                    },
                                    bullet,
                                    GAME_CFG.bullets[weapon.bulletType].color,
                                );
                                if (hit._type === 2 && hit._actor) {
                                    hitWithBullet(hit._actor, bullet, weapon.bulletType === BulletType.Ray);
                                } else {
                                    break;
                                }
                                if (!penetrationsLeft) {
                                    break;
                                }
                            }
                        }
                    }

                    // is not melee weapon
                    if (weapon.bulletType) {
                        addShellParticle(player, PLAYER_HANDS_Z, weapon.bulletShellColor);
                    }
                }
                player._trig |= ControlsFlag.DownEvent_Fire;
            }
        } else {
            player._trig &= ~ControlsFlag.DownEvent_Fire;
            player._detune = (player._detune / 3) | 0;
            player._lifetime = reach(player._lifetime, weapon.launchTime, weapon.relaunchSpeed);
        }
    }

    const prevVelZ = player._w;
    updateActorPhysics(player, game._blocks);

    if (!landed) {
        const isLanded = player._z <= 0 && prevVelZ <= 0;
        if (isLanded) {
            const count = 8;
            const n = abs((count * prevVelZ) / GAME_CFG.player.jumpVel) | 0;
            if (n > 0) {
                addLandParticles(player, 240, n);
            }
        }
    }
};

// 定义一个名为 beginPrediction 的函数，它没有参数，并返回一个布尔值
const beginPrediction = (): boolean => {
    // 如果禁用了预测功能（Const.Prediction 为假）或者游戏加入状态不是已加入状态，则返回 false
    if (!Const.Prediction || game._joinState !== JoinState.Joined) return false;

    // 计算预测的帧数，取最小值为 Const.PredictionMax 和 ((lastFrameTs - game._prevTime) * Const.NetFq) | 0
    let frames = min(Const.PredictionMax, ((lastFrameTs - game._prevTime) * Const.NetFq) | 0);
    // 如果计算出的帧数为 0，则返回 false
    if (!frames) return false;

    // 保存粒子效果和游戏摄像机状态
    saveParticles();
    saveGameCamera();

    // 保存游戏状态
    game._lastState = game._state;
    game._state = cloneStateData(game._state);

    // 模拟 tic，进行预测
    while (frames--) {
        simulateTic(true);
    }
    // 返回 true，表示预测开始
    return true;
};

// 定义一个名为 endPrediction 的函数，不接受任何参数
const endPrediction = () => {
    // 全局状态回滚到上一个状态
    game._state = game._lastState;
    // 将当前游戏状态的随机数种子恢复为上一个状态的种子
    _SEEDS[0] = game._state._seed;
    // 将游戏时钟回滚到上一个状态的时钟值加 1
    game._gameTic = game._state._tic + 1;
    // 恢复粒子效果
    restoreParticles();
    // 恢复游戏摄像机
    restoreGameCamera();
};