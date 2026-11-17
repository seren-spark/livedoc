/**
 * @file 分页文档本地存储。使用 IndexedDB 保存文档元信息、页面内容和目录索引。
 */
/**
 * PagedDocStorage - 分页文档存储层
 *
 * 使用 IndexedDB 存储：
 * - 文档元数据
 * - 页面内容
 * - 目录索引
 */

// 数据模型
export interface DocumentMeta {
  docId: string;
  title: string;
  totalPages: number;
  pageSize: number;
  lastModified: number;
}

export interface PageContent {
  docId: string;
  pageNum: number;
  content: string; // JSON 格式的 ProseMirror 文档
  headings: HeadingInfo[];
  wordCount: number;
  lastModified: number;
}

export interface HeadingInfo {
  id: string;
  text: string;
  level: number;
  posInPage: number;
}

export interface TOCIndex {
  docId: string;
  items: TOCItem[];
  lastModified: number;
}

export interface TOCItem {
  id: string;
  text: string;
  level: number;
  pageNum: number;
  posInPage: number;
}

// IndexedDB 数据库
class PagedDocDB {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'PagedDocuments';
  private readonly DB_VERSION = 1;

  /**
   * 创建插件或本地存储的初始状态。
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 文档元数据表
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', {
            keyPath: 'docId',
          });
          docStore.createIndex('lastModified', 'lastModified', {
            unique: false,
          });
        }

        // 页面内容表
        if (!db.objectStoreNames.contains('pages')) {
          const pageStore = db.createObjectStore('pages', {
            keyPath: ['docId', 'pageNum'],
          });
          pageStore.createIndex('docId', 'docId', { unique: false });
          pageStore.createIndex('lastModified', 'lastModified', {
            unique: false,
          });
        }

        // 目录索引表
        if (!db.objectStoreNames.contains('tocIndexes')) {
          db.createObjectStore('tocIndexes', { keyPath: 'docId' });
        }
      };
    });
  }

  // 文档元数据操作
  /**
   * 文档元数据操作
   *
   * @param docId 知识文档标识。
   * @returns DocumentMeta 类型的处理结果。
   */
  async getDocMeta(docId: string): Promise<DocumentMeta | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['documents'], 'readonly');
      const store = tx.objectStore('documents');
      const request = store.get(docId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 向 IndexedDB 保存分页文档的元信息。
   *
   * @param meta 事务或业务记录的附加元数据。
   */
  async saveDocMeta(meta: DocumentMeta): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['documents'], 'readwrite');
      const store = tx.objectStore('documents');
      const request = store.put(meta);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 页面内容操作
  /**
   * 页面内容操作
   *
   * @param docId 知识文档标识。
   * @param pageNum 请求的页码。
   * @returns PageContent 类型的处理结果。
   */
  async getPage(docId: string, pageNum: number): Promise<PageContent | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['pages'], 'readonly');
      const store = tx.objectStore('pages');
      const request = store.get([docId, pageNum]);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存指定分页的内容与版本信息。
   *
   * @param page 当前页码或页面记录。
   */
  async savePage(page: PageContent): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['pages'], 'readwrite');
      const store = tx.objectStore('pages');
      const request = store.put(page);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除分页文档中指定页面的本地记录。
   *
   * @param docId 知识文档标识。
   * @param pageNum 请求的页码。
   */
  async deletePage(docId: string, pageNum: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['pages'], 'readwrite');
      const store = tx.objectStore('pages');
      const request = store.delete([docId, pageNum]);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 获取文档的所有页码
  /**
   * 获取文档的所有页码
   *
   * @param docId 知识文档标识。
   * @returns 计算得到的数值向量或评分列表。
   */
  async getPageNumbers(docId: string): Promise<number[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['pages'], 'readonly');
      const store = tx.objectStore('pages');
      const index = store.index('docId');
      const request = index.getAll(docId);

      request.onsuccess = () => {
        const pages = request.result as PageContent[];
        const pageNums = pages.map((p) => p.pageNum).sort((a, b) => a - b);
        resolve(pageNums);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 目录索引操作
  /**
   * 目录索引操作
   *
   * @param docId 知识文档标识。
   * @returns TOCIndex 类型的处理结果。
   */
  async getTOCIndex(docId: string): Promise<TOCIndex | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['tocIndexes'], 'readonly');
      const store = tx.objectStore('tocIndexes');
      const request = store.get(docId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存跨页标题索引，供后续目录查询和跳转使用。
   *
   * @param toc 文档的标题目录数据。
   */
  async saveTOCIndex(toc: TOCIndex): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['tocIndexes'], 'readwrite');
      const store = tx.objectStore('tocIndexes');
      const request = store.put(toc);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 清理文档
  /**
   * 删除指定文档对应的数据及关联记录。
   *
   * @param docId 知识文档标识。
   */
  async deleteDocument(docId: string): Promise<void> {
    if (!this.db) await this.init();

    const pageNums = await this.getPageNumbers(docId);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        ['documents', 'pages', 'tocIndexes'],
        'readwrite',
      );

      // 删除元数据
      tx.objectStore('documents').delete(docId);

      // 删除所有页面
      const pageStore = tx.objectStore('pages');
      pageNums.forEach((pageNum) => {
        pageStore.delete([docId, pageNum]);
      });

      // 删除目录
      tx.objectStore('tocIndexes').delete(docId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// 单例实例
export const pagedDocDB = new PagedDocDB();
