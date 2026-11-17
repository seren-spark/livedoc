/**
 * @file 接口调试入口。提供调试用登录与菜单请求。
 */
import { post, get } from '@/utils/request';
interface LoginData {
  username: string;
  password: string;
}
/**
 * 校验登录输入并创建用户会话。
 *
 * @param data 当前事件或操作携带的数据。
 * @returns ApiResponse 类型的处理结果。
 */
export function login(data: LoginData) {
  return post('/login', data);
}

/**
 * 读取当前用户对应的菜单数据。
 *
 * @returns ApiResponse 类型的处理结果。
 */
export function getMenu() {
  return get('/menu');
}
