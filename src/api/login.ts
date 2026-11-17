/**
 * @file 登录 API。封装验证码、密码、第三方登录和菜单请求。
 */
import { post, get } from '@/utils/request';
interface LoginData {
  username?: string;
  email?: string;
  pwd: string;
  code?: string;
}
interface CodeData {
  email: string;
}

// 发送验证码
/**
 * 发送验证码
 *
 * @param options 控制本次行为的可选配置。
 * @returns ApiResponse 类型的处理结果。
 */
export function sendCode({ email }: CodeData) {
  return post(`/auth/email/code/${email}`);
}
/**
 * 提交验证码登录请求。
 *
 * @param options 控制本次行为的可选配置。
 * @returns ApiResponse 类型的处理结果。
 */
export function loginWithCode({ email, code }: LoginData) {
  return post(`/auth/email/login/${email}/${code}`);
}
/**
 * 提交账号密码登录请求。
 *
 * @param data 当前事件或操作携带的数据。
 * @returns ApiResponse 类型的处理结果。
 */
export function loginWithPassword(data: LoginData) {
  return post('/auth/email/login', data);
}
/**
 * 发起第三方身份登录请求。
 *
 * @param type 当前数据或节点类型。
 * @returns ApiResponse 类型的处理结果。
 */
export function loginWithThird(type: string) {
  return post('/auth/' + type + '/login');
}
/**
 * 读取当前用户对应的菜单数据。
 *
 * @returns ApiResponse 类型的处理结果。
 */
export function getMenu() {
  return get('/menu');
}
