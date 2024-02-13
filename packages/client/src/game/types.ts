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

// 定义 Pos 接口描述位置属性
export interface Pos {
    /** uint16 **/
    // x 坐标
    _x: number;
    /** uint16 **/
    // y 坐标
    _y: number;
    /** uint16 */
    // z 坐标
    _z: number;
}

// 定义 Vel 接口描述速度属性
export interface Vel {
    /** int11 [-1024; +1024] **/
    // x 方向速度
    _u: number;
    /** int11 [-1024; +1024] **/
    // y 方向速度
    _v: number;
    /** int11 [-1024; +1024] **/
    // z 方向速度
    _w: number;
}

// 定义 Actor 接口，继承自 Pos 和 Vel 接口
export interface Actor extends Pos, Vel {
    // 角色类型
    _type: ActorType;
    // 角色的唯一标识符
    _id: uint32;

    // 物品：ItemType 的子类型
    // 树木：图形变化
    // 子弹：来源武器的ID
    _subtype: uint4;

    // 玩家：重新装填时间
    // 子弹：生存时间
    // 物品：生存时间除以3
    _lifetime: uint8;

    // 生命值 [0; 15]
    _hp: uint4;

    // 护盾值 [0; 15]
    _sp: uint4;

    // 用于动画生成的静态变化种子值
    _anim0: uint8;

    // 击中效果。对于无法捡起的物品，直到达到0为止
    _animHit: uint5;

    // 本地帧范围状态
    // @transient 表示此属性是瞬态的，可能不会在序列化时被保存
    _localStateFlags: uint32;
}

// 定义 PlayerActor 接口，继承自 Actor 接口
export interface PlayerActor extends Actor {
    // 玩家的客户端ID或NPC的实体ID
    // 32位标识符
    _client: ClientID;

    // 弹匣数量（0 到 15）
    _mags: uint4;

    // 调音计数器：0 到 32（武器调音速度参数的最大值）
    _detune: uint5;

    // 0 到 63（武器弹匣重新装填的最大值）
    _clipReload: uint6;

    // 当前持有的武器ID
    // 范围：0 到 15
    _weapon: uint4;
    _weapon2: uint4;

    // 0 到 63（武器弹匣容量的最大值）
    _clipAmmo: uint6;
    _clipAmmo2: uint6;

    // 检查下压扳机
    _trig: uint4;

    // 输入按钮
    _input: uint32;
}

export type BarrelActor = Actor;

// 定义 BulletActor 接口，继承自 Actor 接口
export interface BulletActor extends Actor {
    // 子弹的所有者ID，即发射子弹的客户端ID
    _ownerId: ClientID;

    // 子弹射程的终点坐标（仅用于视觉效果）
    _x1?: number;
    _y1?: number;
}

// 定义 ItemActor 接口，继承自 Actor 接口
export interface ItemActor extends Actor {
    // 物品的武器类型，范围为 0 到 15
    _itemWeapon: uint4;
    // 物品武器的弹药数量，范围为 0 到 63（最大武器弹药容量）
    _itemWeaponAmmo: uint6;
}

// 定义 Client 接口
export interface Client {
    // 客户端的唯一标识符
    _id: ClientID;

    // 远程已确认的本地输入的游戏时间
    // 即从 remote-ack + 1 到本地游戏时间
    _acknowledgedTic: number;

    // 从远程收到的完成输入的游戏时间
    _tic: number;

    // 客户端连接时的时间戳
    _ts0: number;

    // 客户端最近一次响应的时间戳
    _ts1: number;

    // 客户端的网络延迟（可选）
    _lag?: number;

    // 客户端加入游戏的状态（可选）
    _joinState?: JoinState;

    // 客户端是否准备好开始游戏（可选）
    _ready?: boolean;

    // 客户端是否正在播放我的事件（可选）
    _isPlaying?: boolean;

    // 客户端开始游戏时的状态数据（可选）
    _startState?: StateData;

    // 客户端是否正在加载状态（可选）
    _loadingState?: boolean;
}

// 定义 ClientEvent 接口
export interface ClientEvent {
    // 客户端事件发生的游戏时间或步骤
    _tic: number;
    // TODO: 重命名为 `_input`，表示输入事件
    _input?: number;
    // 将从数据包信息中填充
    // 事件相关的客户端ID，表示事件发生的客户端
    _client: ClientID;
}

// 定义 PlayerStat 接口
export interface PlayerStat {
    // 玩家得分
    _scores: number;
    // 玩家击杀数
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
