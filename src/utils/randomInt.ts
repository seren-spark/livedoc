/**
 * @file 随机整数工具。按给定范围生成用于界面示例的随机整数。
 */
/**
 * 生成随机整数
 * @param min 最小值
 * @param max 最大值
 *
 * @returns 计算得到的数值。
 */
export function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
