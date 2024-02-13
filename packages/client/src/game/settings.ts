// 是否为 Poki 构建的布尔常量
import { IsPokiBuild } from "@iioi/shared/types.js";

// 设置存储键的前缀
const prefix = "iioi";

// 血液模式常量对象
export const BloodMode = {
    Off: 0,
    Normal: 1,
    Paint: 2,
} as const;
// 血液模式类型别名
export type BloodMode = (typeof BloodMode)[keyof typeof BloodMode];

// 默认帧速率限制
export const DEFAULT_FRAMERATE_LIMIT = 60;

// 设置类型常量对象
export const Setting = {
    Name: 0,
    Flags: 1,
    Blood: 2,
    Particles: 3,
    FrameRateCap: 4,
} as const;
// 设置类型类型别名
export type Setting = (typeof Setting)[keyof typeof Setting];

// 设置标志常量对象
/* @__PURE__ */
export const SettingFlag = {
    Sound: 1 << 0,
    Music: 1 << 1,
    Speech: 1 << 2,
    HighDPI: 1 << 3,
    DevMode: 1 << 4,
    DevShowFrameStats: 1 << 5,
    DevShowCollisionInfo: 1 << 6,
    DevShowDebugInfo: 1 << 7,
    DevLogging: 1 << 8,
    DevAutoPlay: 1 << 9,
    Antialiasing: 1 << 10,
} as const;
// 设置标志类型别名
export type SettingFlag = (typeof SettingFlag)[keyof typeof SettingFlag];

// 设置对象的接口，描述了各种设置的属性类型
interface SettingsMap {
    [Setting.Name]: string;          // 设置的名称，对应的值是字符串类型
    [Setting.Flags]: SettingFlag;    // 设置的标志位，对应的值是 SettingFlag 类型
    [Setting.Blood]: BloodMode;      // 血液模式设置，对应的值是 BloodMode 类型
    [Setting.Particles]: number;     // 粒子设置，对应的值是数字类型
    [Setting.FrameRateCap]: number;  // 帧率上限设置，对应的值是数字类型
}

// 设置对象，包含了各种设置的初始值
export const settings: SettingsMap = {
    [Setting.Name]: "",
    [Setting.Flags]:
        SettingFlag.Sound |
        SettingFlag.Music |
        SettingFlag.Speech |
        SettingFlag.HighDPI |
        SettingFlag.DevShowFrameStats |
        SettingFlag.DevShowDebugInfo |
        SettingFlag.DevLogging,
    [Setting.Blood]: IsPokiBuild ? BloodMode.Paint : BloodMode.Normal,
    [Setting.Particles]: 1,
    [Setting.FrameRateCap]: DEFAULT_FRAMERATE_LIMIT,
} as const;

// 获取设置项的值
const getItem = (key: Setting | string): string | undefined => {
    try {
        return localStorage.getItem(prefix + key);
    } catch {
        // 忽略错误
    }
};

// 设置设置项的值
const setItem = (key: Setting, value: string) => {
    try {
        localStorage.setItem(prefix + key, value);
    } catch {
        // 忽略错误
    }
};

// 从本地存储中加载设置项的值
for (const key in settings) {
    const v = getItem(key);
    if (v != null) {
        const type = typeof settings[key];
        switch (type) {
            case "number":
                settings[key] = parseFloat(v);
                break;
            case "string":
                settings[key] = v;
                break;
        }
    }
}

// 设置设置项的值，并保存到本地存储中
export const setSetting = <K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): SettingsMap[K] => {
    settings[key] = value;
    setItem(key, "" + value);
    return value;
};

// 获取开发标志位
/* @__PURE__ */
// 获取开发标志位的函数，用于检查指定的开发标志位是否被设置
export const getDevFlag = (key: SettingFlag = 0): boolean =>
    // 返回按位与操作的结果是否等于指定的开发标志位
    (settings[Setting.Flags] & (SettingFlag.DevMode | key)) === (SettingFlag.DevMode | key);

// 启用设置标志位
export const enableSettingsFlag = (flag: SettingFlag) => setSetting(Setting.Flags, settings[Setting.Flags] | flag);

// 判断是否存在设置标志位
/* @__PURE__ */
export const hasSettingsFlag = (flag: SettingFlag): boolean => (settings[Setting.Flags] & flag) === flag;

// 切换设置标志位
export const toggleSettingsFlag = (mask: SettingFlag) => setSetting(Setting.Flags, settings[Setting.Flags] ^ mask);
