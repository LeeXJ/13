import {ClientID} from "@iioi/shared/types.js";
import {clientId, clientName, remoteClients} from "../net/messaging.js";
import {ReplayFile} from "./replay/replayFile.js";
import {
    Actor,
    ActorType,
    BarrelActor,
    Client,
    ClientEvent,
    ItemActor,
    newStateData,
    PlayerActor,
    StateData,
} from "@iioi/client/game/types.js";
import {Const} from "@iioi/client/game/config.js";
import {roundActors} from "@iioi/client/game/phy.js";

// 定义了一个全局变量 lastFrameTs，用于存储上一帧的时间戳
export let lastFrameTs = 0.0;

// 定义了一个名为 resetLastFrameTs 的函数，用于将上一帧的时间戳重置为 0
export const resetLastFrameTs = () => {
    lastFrameTs = 0.0;
};

// 定义了一个名为 updateFrameTime 的函数，用于更新上一帧的时间戳
export const updateFrameTime = (ts: number) => {
    // 如果传入的时间戳大于上一帧的时间戳，则更新上一帧的时间戳为传入的时间戳
    if (ts > lastFrameTs) {
        lastFrameTs = ts;
    }
};

export const getNameByClientId = (client: ClientID) =>
    client === clientId ? clientName : remoteClients.get(client)?._name;

export const GameMenuState = {
    InGame: 0,
    Paused: 1,
    Settings: 2,
    Respawn: 3,
} as const;
export type GameMenuState = (typeof GameMenuState)[keyof typeof GameMenuState];

export interface GameMode {
    _title: boolean;
    _runAI: boolean;
    _playersAI: boolean;
    _hasPlayer: boolean;
    _tiltCamera: number;
    _bloodRain: boolean;
    _npcLevel: number;
    _replay?: ReplayFile;
    _menu: GameMenuState;
    _respawnStartTic: number;
}

// 定义了一个名为 gameMode 的常量对象，类型为 GameMode
export const gameMode: GameMode = {
    // 是否显示标题
    _title: false,
    // 是否运行AI
    _runAI: false,
    // 是否有玩家AI
    _playersAI: false,
    // 是否有玩家
    _hasPlayer: false,
    // 摄像机倾斜角度
    _tiltCamera: 0.0,
    // 是否下血雨
    _bloodRain: false,
    // NPC等级
    _npcLevel: 0,
    // 游戏菜单状态
    _menu: GameMenuState.InGame,
    // 重生开始的时间间隔
    _respawnStartTic: 0,
};

// 定义了一个名为 JoinState 的常量对象，用于表示玩家加入游戏的不同状态
export const JoinState = {
    // 等待状态
    Wait: 0,
    // 加载状态
    LoadingState: 1,
    // 同步状态
    Sync: 2,
    // 已加入状态
    Joined: 3,
} as const;

// 定义了一个名为 JoinState 的类型别名，用于描述 JoinState 对象中所有属性的类型
export type JoinState = (typeof JoinState)[keyof typeof JoinState];

export interface Game {
    _clients: Map<ClientID, Client>;
    _localEvents: ClientEvent[];
    _receivedEvents: ClientEvent[];

    _joinState: JoinState;
    _gameTic: number;
    _prevTime: number;
    _waitToAutoSpawn: boolean;
    _waitToSpawn: boolean;
    _allowedToRespawn: boolean;
    _lastInputTic: number;
    _lastInputCmd: number;
    _lastAudioTic: number;
    _trees: Actor[];
    _playersGrid: PlayerActor[][];
    _barrelsGrid: BarrelActor[][];
    _treesGrid: Actor[][];
    _hotUsable?: ItemActor;
    _state: StateData;
    _lastState?: StateData;

    _blocks: number[];

    _processingPrediction: boolean;
}

// 定义了一个名为 game 的常量，类型为 Game
export const game: Game = {
    // 存储客户端ID和对应的客户端对象的映射
    _clients: new Map<ClientID, Client>(),
    // 存储本地事件的数组
    _localEvents: [],
    // 存储接收到的事件的数组
    _receivedEvents: [],
    // 存储玩家加入游戏的状态
    _joinState: JoinState.Wait,
    // 游戏的 tic 数（时间间隔）
    _gameTic: 0,
    // 上一个时间戳
    _prevTime: 0,
    // 是否等待自动重生
    _waitToAutoSpawn: false,
    // 是否等待重生
    _waitToSpawn: false,
    // 是否允许重生
    _allowedToRespawn: false,
    // 上一个输入 tic
    _lastInputTic: 0,
    // 上一个输入命令
    _lastInputCmd: 0,
    // 上一个音频 tic
    _lastAudioTic: 0,
    // 树的数组
    _trees: [],
    // 玩家网格
    _playersGrid: [],
    // 桶的网格
    _barrelsGrid: [],
    // 树的网格
    _treesGrid: [],
    // 游戏状态数据
    _state: newStateData(),
    // 障碍物数组
    _blocks: [],
    // 是否正在处理预测
    _processingPrediction: false,
};

// 定义了一个名为 getMyPlayer 的函数，它不接受参数
export const getMyPlayer = (): PlayerActor | undefined =>
    // 如果存在客户端ID，则调用 getPlayerByClient 函数获取对应的玩家角色，否则返回 undefined
    (clientId ? getPlayerByClient(clientId) : undefined);

// 定义了一个名为 getPlayerByClient 的函数，它接受一个名为 c 的参数，类型为 ClientID
export const getPlayerByClient = (c: ClientID): PlayerActor | undefined =>
    // 在游戏状态的角色列表中查找类型为 Player 的角色，并返回第一个满足条件的角色
    game._state._actors[ActorType.Player].find(p => p._client == c);

// 定义了一个名为 getMinTic 的函数，它接受一个名为 _tic 的参数，默认值为 1 左移 30 位
export const getMinTic = (_tic: number = 1 << 30) => {
    // 如果处于回放模式，则返回当前游戏的游戏 tic 数
    if (gameMode._replay) {
        return game._gameTic;
    }
    // 如果没有客户端ID
    if (!clientId) {
        // 更新 _tic 的值，计算方法包括游戏 tic 数、输入延迟和时间间隔等因素
        _tic = game._gameTic + Const.InputDelay + (((lastFrameTs - game._prevTime) * Const.NetFq) | 0);
    }
    // 初始化客户端总数
    let clientsTotal = 0;
    // 遍历游戏中的所有客户端
    for (const [, client] of game._clients) {
        // 增加客户端总数
        ++clientsTotal;
        // 更新 _tic 的值，如果当前客户端的 tic 数大于 _tic，则将 _tic 更新为当前客户端的 tic 数
        if (_tic > client._tic) {
            _tic = client._tic;
        }
    }
    // 如果没有客户端
    if (!clientsTotal) {
        // 更新 _tic 的值，计算方法包括游戏 tic 数和时间间隔等因素
        _tic = game._gameTic + (((lastFrameTs - game._prevTime) * Const.NetFq) | 0);
    }
    // 返回 _tic 的值
    return _tic;
};

// 定义了一个名为 normalizeStateData 的函数，它接受一个名为 state 的参数，类型为 StateData
export const normalizeStateData = (state: StateData) => {
    // 遍历 state._actors 数组中的每一个列表
    for (const list of state._actors) {
        // 对列表进行排序，按照 Actor 对象的 _id 属性升序排序
        list.sort((a: Actor, b: Actor): number => a._id - b._id);
        // 调用 roundActors 函数，将列表中的每个 Actor 对象的属性进行归一化处理
        roundActors(list);
    }
};
