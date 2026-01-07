/**
 * 透传加密函数 - 当前未实现真正的加密
 *
 * TODO: 实现真正的加密逻辑时，需要同步更新：
 * - 前端: 本文件的 passThroughEncrypt -> 真正的 encrypt
 * - 后端: backend/api/routes/root.py 的 passThroughDecrypt -> 真正的 decrypt
 *
 * 注意: 当前 secret:timestamp 以明文传输，安全性依赖 HTTPS
 *
 * @param {string} raw - 原始字符串（格式: secret:timestamp）
 * @returns {string} - 当前直接返回原文
 */
export const passThroughEncrypt = (raw) => raw