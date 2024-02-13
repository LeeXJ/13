import {ClientID} from "@iioi/shared/types.js";
import {atan2, PI, PI2} from "../utils/math.js";
import {JoinState} from "./gameState.js";
import {uint3, uint32, uint4, uint5, uint6, uint8} from "@iioi/shared/int.js";

export const ActorType = {
    Player: 0,
    Barrel: 1,
    Bullet: 2,
    Item: 3,
    // static game objects
    Tree: 4,
} as const;
export type ActorType = uint3 | (typeof ActorType)[keyof typeof ActorType];

export const ItemType = {
    Hp: 0,
    Hp2: 1,
    Credit: 2,
    Credit2: 3,
    Shield: 4,
    Ammo: 5,
    // FLAG
    Weapon: 8,

    SubTypeMask: 7,
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export interface Pos {
    /** uint16 **/
    _x: number;
    /** uint16 **/
    _y: number;
    /** uint16 */
    _z: number;
}

export interface Vel {
    /** int11 [-1024; +1024] **/
    _u: number;
    /** int11 [-1024; +1024] **/
    _v: number;
    /** int11 [-1024; +1024] **/
    _w: number;
}

export interface Actor extends Pos, Vel {
    _type: ActorType;
    _id: uint32;

    // Item: ItemType subtype
    // Tree: GFX variation
    // Bullet: source weapon ID
    _subtype: uint4;

    // Player: reload time
    // Bullet: life-time
    // Item: life-time / 3
    _lifetime: uint8;

    /**
     * health points [0; 15]
     **/
    _hp: uint4;

    /**
     * shield points [0; 15]
     **/
    _sp: uint4;

    /**
     * generated static variation seed value for animation
     **/
    _anim0: uint8;

    /**
     * Hit effect. For Items could not be picked up until it reach 0
     **/
    _animHit: uint5;

    /**
     * local frame-scope state
     * @transient
     **/
    _localStateFlags: uint32;
}

export interface PlayerActor extends Actor {
    // Player: client ID or NPC ~entityID
    // 32-bit identifier
    _client: ClientID;

    // Magazines (0..15)
    _mags: uint4;

    // detune counter: 0...32 (max of weapon detune-speed parameter)
    _detune: uint5;

    // 0...63 (max_weapon_clip_reload)
    _clipReload: uint6;

    // holding Weapon ID
    // range: 0...15 currently
    _weapon: uint4;
    _weapon2: uint4;

    // 0...63 (max_weapon_clip_size)
    _clipAmmo: uint6;
    _clipAmmo2: uint6;

    // oh... check down trigger
    _trig: uint4;

    // Input buttons
    _input: uint32;
}

export type BarrelActor = Actor;

export interface BulletActor extends Actor {
    // Bullet: owner ID
    _ownerId: ClientID;

    // end of ray projectile (just visuals)
    _x1?: number;
    _y1?: number;
}

export interface ItemActor extends Actor {
    // range: 0...15 currently
    _itemWeapon: uint4;
    // 0...63 (max_weapon_clip_size)
    _itemWeaponAmmo: uint6;
}

export interface Client {
    _id: ClientID;

    // how many MY inputs are acknowledged by remote [remote-ack + 1 .. local tic]
    _acknowledgedTic: number;

    // completed inputs received from remote
    _tic: number;
    _ts0: number;
    _ts1: number;
    _lag?: number;

    _joinState?: JoinState;

    // client starts play my events
    _ready?: boolean;

    // I'm playing client's events
    _isPlaying?: boolean;

    _startState?: StateData;
    _loadingState?: boolean;
}

export interface ClientEvent {
    _tic: number;
    // TODO: rename to `_input`
    _input?: number;
    // will be populated from packet info
    _client: ClientID;
}

export interface PlayerStat {
    _scores: number;
    _frags: number;
}

// 定义 StateData 接口
export interface StateData {
    // 下一个实体的唯一标识符
    _nextId: number;
    // 游戏的当前时间或步骤
    _tic: number;
    // 用于生成随机数的种子
    _seed: number;
    // 包含游戏中不同类型实体的数组
    _actors: [
        PlayerActor[],    // 玩家角色数组
        BarrelActor[],    // 桶角色数组
        BulletActor[],    // 子弹角色数组
        ItemActor[]       // 物品角色数组
    ];
    // 存储玩家统计信息的 Map 对象
    _stats: Map<ClientID, PlayerStat>;
}

// 定义了一个名为 newStateData 的函数，用于创建一个新的 StateData 对象并初始化其属性值
export const newStateData = (): StateData => ({
    // 初始化下一个 ID 为 0
    _nextId: 0,
    // 初始化 tic 为 0
    _tic: 0,
    // 初始化种子为 0
    _seed: 0,
    // 初始化 actors 数组为一个空的二维数组，每个子数组都为空
    _actors: [[], [], [], []],
    // 初始化 stats 为一个空的 Map 对象
    _stats: new Map(),
});

// 定义了一个名为 cloneStateData 的函数，用于克隆一个状态数据对象
export const cloneStateData = (stateToCopy: StateData): StateData => ({
    // 使用对象展开运算符 (...) 克隆 stateToCopy 对象的所有属性和值
    ...stateToCopy,
    // 克隆 _actors 数组中的每个子数组中的所有元素
    _actors: [
        stateToCopy._actors[0].map(a => ({...a})),
        stateToCopy._actors[1].map(a => ({...a})),
        stateToCopy._actors[2].map(a => ({...a})),
        stateToCopy._actors[3].map(a => ({...a})),
    ],
    // 使用新的 Map 对象克隆 stateToCopy._stats 中的键值对
    _stats: new Map([...stateToCopy._stats.entries()].map(([k, v]) => [k, {...v}])),
});

// packet = remote_events[cl.ack + 1] ... remote_events[cl.tic]
// 定义了一个名为 Packet 的接口，用于描述游戏中用于通信的数据包
export interface Packet {
    // 加入状态
    _joinState: JoinState;
    // 确认我们从发送者那里收到的最后一个 tic
    _receivedOnSender: number;
    // 数据包包含的 tic 信息，22 位，用于 19 小时的游戏会话
    _tic: number;

    // 用于测量两个对等体之间的延迟的时间戳
    _ts0: number;
    _ts1: number;

    // 未确认的事件
    _events: ClientEvent[];
    // 调试用：检查当前的 tic 种子
    _debug?: PacketDebug;
}

// 定义了一个名为 PacketDebug 的接口，用于描述调试用途的数据包信息
export interface PacketDebug {
    // 下一个实体的唯一标识符
    _nextId: number;
    // 游戏状态的迭代次数
    _tic: number;
    // 随机数种子，用于生成随机数序列
    _seed: number;
    // 可选的状态数据对象，用于包含游戏状态的详细信息
    _state?: StateData;
}

// 解包角度字节函数
export const unpackAngleByte = (angleByte: number, res: number) =>
    // 角度 = (PI2 * (角度字节 & (分辨率 - 1))) / 分辨率 - PI
    (PI2 * (angleByte & (res - 1))) / res - PI;

// 打包角度字节函数
export const packAngleByte = (a: number, res: number) =>
    // 角度字节 = (分辨率 * 角度) & (分辨率 - 1)
    (res * a) & (res - 1);

// 打包方向字节函数
export const packDirByte = (x: number, y: number, res: number) =>
    // 打包角度字节((PI + atan2(y, x)) / PI2, 分辨率)
    packAngleByte((PI + atan2(y, x)) / PI2, res);

/*
    First 19 bits
    [ ..... LA-LA-LA-LA-LA-LA-LA MA-MA-MA-MA-MA-MA Sp Dr Sh Ju Ru Mo ]

    Next high 13 bits not used
 */
// 定义控制标志常量对象
export const ControlsFlag = {
    // 移动标志
    Move: 0x1,
    // 奔跑标志
    Run: 0x2,
    // 跳跃标志
    Jump: 0x4,
    // 开火标志
    Fire: 0x8,
    // 丢弃标志
    Drop: 0x10,
    // 重新装填标志
    Reload: 0x20,
    // 切换标志
    Swap: 0x40,
    // 生成标志
    Spawn: 0x80,

    // 移动角度的最大值，用于移动角度的限制
    MoveAngleMax: 0x20,
    // 移动角度的位数，用于移动角度的位掩码
    MoveAngleBit: 8,
    // 视角角度的最大值，用于视角角度的限制
    LookAngleMax: 0x100,
    // 视角角度的位数，用于视角角度的位掩码
    LookAngleBit: 13,

    // 按下事件的开火标志
    DownEvent_Fire: 1,
    // 按下事件的丢弃标志
    DownEvent_Drop: 2,
    // 按下事件的重新装填标志
    DownEvent_Reload: 4,
    // 按下事件的切换标志
    DownEvent_Swap: 8,
} as const;

// 控制标志的类型别名
export type ControlsFlag = (typeof ControlsFlag)[keyof typeof ControlsFlag];
