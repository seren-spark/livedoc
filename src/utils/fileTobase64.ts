/**
 * @file 文件编码工具。将浏览器文件读取为 Base64 数据用于预览或请求。
 */
/**
 * 将文件转换为 Base64 编码字符串
 * @param file 文件对象
 * @returns Promise<string> Base64 编码字符串
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        resolve(event.target.result);
      } else {
        reject(new Error('Failed to read file as Base64'));
      }
    };

    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsDataURL(file);
  });
};

export default fileToBase64;
