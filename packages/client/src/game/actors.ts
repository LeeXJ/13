import {Actor, ActorType, BulletActor, ItemActor, ItemType, PlayerActor} from "./types.js";
import {rand} from "../utils/rnd.js";
import {GAME_CFG} from "./config.js";
import {ClientID} from "@iioi/shared/types.js";
import {ANIM_HIT_OVER} from "../assets/params.js";

// 定义一个新的角色对象，并返回该对象
export const newActor = (type: ActorType): Actor => ({
    // 设置角色对象的 _id 属性为零
    _id: 0,
    // 设置角色对象的 _type 属性为指定的角色类型
    _type: type,
    // 设置角色对象的 _subtype 属性为零
    _subtype: 0,
    // 设置角色对象的位置属性（_x、_y、_z）为零
    _x: 0,
    _y: 0,
    _z: 0,
    // 设置角色对象的速度属性（_u、_v、_w）为零
    _u: 0,
    _v: 0,
    _w: 0,
    // 设置角色对象的生存时间属性（_lifetime）为零
    _lifetime: 0,
    // 设置角色对象的动画属性（_anim0、_animHit）为随机值和 31
    _anim0: rand(0x100),
    _animHit: 31,
    // 设置角色对象的生命值和护盾值属性（_hp、_sp）为 1 和 0
    _hp: 1,
    _sp: 0,
    // 设置角色对象的本地状态标志属性（_localStateFlags）为零
    _localStateFlags: 0,
});

// 定义一个新的玩家角色对象，并返回该对象
export const newPlayerActor = (): PlayerActor =>
    // 使用 Object.assign 方法创建一个新的对象，基于已有的 ActorType.Player 对象
    Object.assign(newActor(ActorType.Player), {
        // 设置新对象的 _client、_input、_trig、_detune、_weapon、_weapon2、_clipAmmo、_clipAmmo2、_clipReload、_mags 属性为零
        _client: 0,
        _input: 0,
        _trig: 0,
        _detune: 0,
        _weapon: 0,
        _weapon2: 0,
        _clipAmmo: 0,
        _clipAmmo2: 0,
        _clipReload: 0,
        _mags: 0,
    });

// 定义一个新的物品角色对象，并返回该对象
export const newItemActor = (subtype: number): ItemActor => {
    // 创建一个新的 ActorType.Item 类型的角色对象
    const item = newActor(ActorType.Item) as ItemActor;
    // 设置物品角色对象的 _subtype 属性为指定的子类型
    item._subtype = subtype;
    // 设置物品角色对象的 _lifetime 属性为游戏配置中物品的生存时间
    item._lifetime = GAME_CFG.items.lifetime;
    // 设置物品角色对象的 _animHit 属性为 ANIM_HIT_OVER 常量
    item._animHit = ANIM_HIT_OVER;
    // 初始化物品角色对象的 _itemWeapon 和 _itemWeaponAmmo 属性为零
    item._itemWeapon = 0;
    item._itemWeaponAmmo = 0;
    // 返回创建的物品角色对象
    return item;
};

export const itemContainsAmmo = (item: ItemActor) => (item._subtype & ItemType.SubTypeMask) === ItemType.Ammo;

// 定义一个新的子弹角色对象，并返回该对象
export const newBulletActor = (ownerId: ClientID, weapon: number): BulletActor =>
    // 使用 Object.assign 方法创建一个新的对象，基于已有的 ActorType.Bullet 对象
    Object.assign(newActor(ActorType.Bullet), {
        // 设置新对象的 _ownerId 属性为指定的所有者ID
        _ownerId: ownerId,
        // 设置新对象的 _subtype 属性为指定的武器类型
        _subtype: weapon,
    });

